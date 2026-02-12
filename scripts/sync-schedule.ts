
import puppeteer from 'puppeteer';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

// Configs (Load from ENV)
const CLIENT_URL = 'https://rip.nspenha.com.br/retaguarda/index.phtml';
const CLIENT_AGENCY = process.env.CLIENT_AGENCY || '000000';
const CLIENT_USER = process.env.CLIENT_USER || 'JVS001';
const CLIENT_PASS = process.env.CLIENT_PASS || 'JVS@2026';

const APP_URL = process.env.APP_URL || 'https://bus-manager-nine.vercel.app'; // Update if domain changes
const APP_EMAIL = process.env.APP_EMAIL || 'admin@busmanager.com'; // User to perform the upload
const APP_PASSWORD = process.env.APP_PASSWORD || 'admin123';

async function run() {
    console.log('🚀 Starting Schedule Sync Bot...');
    let browser;
    let page;

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        page = await browser.newPage();

        // Listen for alerts/popups (e.g., "Invalid Password")
        page.on('dialog', async dialog => {
            console.log(`⚠️ JS Alert Detected: ${dialog.message()}`);
            await dialog.dismiss();
        });


        // Disable navigation timeout or increase it
        page.setDefaultNavigationTimeout(60000);

        // --- 1. Login to Client Portal ---
        console.log(`P1. Navigation to ${CLIENT_URL}...`);
        await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' }); // Faster than networkidle0

        // Type Agency, User, Password
        // Wait a bit more for frames to load
        await new Promise(r => setTimeout(r, 3000));

        // Type Agency, User, Password
        console.log('P2. Filling Credentials...');

        let targetFrame: any = page;
        let inputs: any[] = [];

        // Robust Input Discovery (Frames + Types)
        const frames = page.frames();
        console.log(`Analyzing ${frames.length} frames...`);

        for (const frame of frames) {
            // Look for visible input fields that aren't buttons/hidden
            // Common types for agency/user: text, number, email, password, or no type info
            const frameInputs = await frame.$$('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"])');
            if (frameInputs.length >= 3) {
                console.log(`Found ${frameInputs.length} inputs in frame: ${frame.url()}`);
                inputs = frameInputs;
                targetFrame = frame;
                break;
            }
        }

        if (inputs.length < 3) {
            // Debug logging
            const bodyHTML = await page.content();
            console.log('Main Frame HTML Preview:', bodyHTML.substring(0, 500));
            throw new Error(`Found only ${inputs.length} inputs in potential frames. Expected at least 3.`);
        }

        try {
            // Heuristic: 1=Agency, 2=User, 3=Password
            await inputs[0].type(CLIENT_AGENCY);
            await inputs[1].type(CLIENT_USER);
            await inputs[2].type(CLIENT_PASS);

            // Try submitting via Enter key first (often more reliable)
            console.log('P2.1 Pressing Enter...');
            await inputs[2].press('Enter');

        } catch (e) {
            console.error('Error typing credentials:', e);
            throw e;
        }

        // Wait potential navigation from Enter
        try {
            await Promise.race([
                targetFrame.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }),
                new Promise(r => setTimeout(r, 2000))
            ]);
        } catch (e) { }

        // Click Login Button inside the same frame (Backup)
        console.log('P3. Clicking Login (Backup)...');
        await targetFrame.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('input[type="button"], button, input[type="submit"], a'));
            const loginBtn = buttons.find(b => {
                const val = (b as HTMLInputElement).value || b.textContent || '';
                return val.includes('Acessar') || val.includes('Login') || val.includes('Entrar');
            });
            if (loginBtn) {
                console.log('Login button found, clicking...');
                (loginBtn as HTMLElement).click();
            } else {
                throw new Error('Login button not found in target frame');
            }
        });

        // Wait for navigation - handle case where it might be a frame navigation or top navigation
        console.log('P3.1 Waiting for navigation...');
        try {
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                targetFrame.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
                // Check for successful login indicators
                page.waitForFunction(() => document.body.innerText.includes('Menus Disponíveis') || document.body.innerText.includes('Escala Programada'), { timeout: 15000 }),
                new Promise(r => setTimeout(r, 5000)) // Fallback wait
            ]);
        } catch (e) {
            console.log('Navigation wait timeout (might be partial update), continuing...');
        }

        console.log('Login action completed. Checking for report link...');

        // --- 2. Navigate to "Escala Programada" ---
        console.log('P3. Navigating to Report...');

        // Take a screenshot of the dashboard to see what we have
        await page.screenshot({ path: 'dashboard.png', fullPage: true });

        // Check if we need to open a menu first
        // Look for "Menus Disponíveis do Sistema"
        const menuClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="button"], div, span, a'));
            const menuBtn = buttons.find(b => {
                const val = b.textContent || (b as HTMLInputElement).value || '';
                return val.includes('Menus Disponíveis do Sistema');
            });

            // Should we click it? Only if "Escala Programada" is NOT visible
            const reportLink = Array.from(document.querySelectorAll('a')).find(l => l.textContent?.includes('Escala Programada'));

            if (!reportLink && menuBtn) {
                console.log('Clicking "Menus Disponíveis do Sistema"...');
                (menuBtn as HTMLElement).click();
                return true;
            }
            return false;
        });

        if (menuClicked) {
            console.log('Menu clicked, waiting for expansion...');
            await new Promise(r => setTimeout(r, 2000));
            await page.screenshot({ path: 'menu-expanded.png' });
        }

        const linkFound = await page.evaluate(() => {
            // Re-query links after potential menu click
            // Broad search for any clickable element with the text
            const elements = Array.from(document.querySelectorAll('a, span, div, td, li'));
            const target = elements.find(el => el.textContent?.includes('Escala Programada') && (el.tagName === 'A' || el.style.cursor === 'pointer' || (el as HTMLElement).onclick));

            // Fallback: just look for the text if it's unique enough
            const anyTarget = elements.find(el => el.textContent?.includes('Escala Programada') && el.children.length === 0);

            const finalTarget = target || anyTarget;

            if (finalTarget) {
                console.log(`Found target element: ${finalTarget.tagName}, Text: ${finalTarget.textContent}`);
                (finalTarget as HTMLElement).click();
                return true;
            }
            return false;
        });

        if (!linkFound) {
            // Check frame?
            console.log('Link not found in top frame. Checking frames...');
            // Recursive check in frames just in case
            let foundInFrame = false;
            const frames = page.frames();
            for (const frame of frames) {
                const frameLinkFound = await frame.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('a, span, div, td, li'));
                    // Broad search inside frame
                    const target = elements.find(el => el.textContent?.includes('Escala Programada'));

                    if (target) {
                        console.log(`Found target in frame: ${target.tagName}, Text: ${target.textContent}`);
                        (target as HTMLElement).click();
                        return true;
                    }
                    return false;
                });
                if (frameLinkFound) {
                    foundInFrame = true;
                    break;
                }
            }

            if (!foundInFrame) {
                console.log('Link not found in any frame. taking screenshot.');
                await page.screenshot({ path: 'error-missing-link.png', fullPage: true });
                throw new Error('Link "Escala Programada" not found');
            }
        }

        // Wait for the specific report page to load
        console.log('P4. Waiting for Report Page...');
        await page.waitForFunction(() => {
            const bodyText = document.body.innerText;
            return bodyText.includes('Pesquisar') || bodyText.includes('Imprimir');
        }, { timeout: 30000 });

        // --- 3. Execute Search ---
        console.log('P4. Executing Search...');

        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('input[type="button"], button, input[type="submit"]'));
            const searchBtn = buttons.find(b => {
                const val = (b as HTMLInputElement).value || b.textContent || '';
                return val.includes('Pesquisar');
            });
            if (searchBtn) (searchBtn as HTMLElement).click();
        });

        // Wait for results
        await new Promise(r => setTimeout(r, 5000));

        // --- 4. Print/Export ---
        console.log('P5. Exporting PDF...');

        // Handle Print Popup
        const newTargetPromise = browser.waitForTarget(target => target.opener() === page.target());

        const printClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('input[type="button"], button, input[type="submit"], a'));
            const printBtn = buttons.find(b => {
                const val = (b as HTMLInputElement).value || b.textContent || '';
                return val.includes('Imprimir');
            });
            if (printBtn) {
                (printBtn as HTMLElement).click();
                return true;
            }
            return false;
        });

        if (!printClicked) throw new Error('Print button not found');

        const newTarget = await newTargetPromise;
        const printPage = await newTarget.page();

        if (!printPage) throw new Error('Print popup captured but page object is null.');

        await printPage.bringToFront();
        // Wait for PDF content to render
        await new Promise(r => setTimeout(r, 3000));

        const pdfPath = path.join(process.cwd(), 'schedule.pdf');

        await printPage.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true,
            landscape: true
        });

        console.log(`PDF Generated at ${pdfPath}`);

        // --- 5. Upload to BusManager ---
        console.log('P6. Uploading to BusManager...');

        // 5a. Login to BusManager to get Token
        const authRes = await axios.post(`${APP_URL}/api/auth/login`, {
            email: APP_EMAIL,
            password: APP_PASSWORD
        });

        // Extract token from cookie or response
        const cookies = authRes.headers['set-cookie'];
        if (!cookies) throw new Error('Failed to retrieve auth cookie from BusManager login.');

        const cookieHeader = cookies.join('; ');

        // 5b. Upload File
        const form = new FormData();
        form.append('file', fs.createReadStream(pdfPath));

        const uploadRes = await axios.post(`${APP_URL}/api/schedule/import`, form, {
            headers: {
                ...form.getHeaders(),
                'Cookie': cookieHeader
            }
        });

        console.log('Upload Success:', uploadRes.data);

        await browser.close();

    } catch (error) {
        console.error('Fatal Error:', error);
        if (page) {
            try {
                await page.screenshot({ path: 'error-state.png', fullPage: true });
                console.log('Screenshot saved to error-state.png');
            } catch (screenErr) {
                console.error('Failed to take screenshot', screenErr);
            }

            // Dump HTML for debugging
            try {
                const html = await page.content();
                fs.writeFileSync('error-page.html', html);
            } catch (htmlErr) { }
        }
        if (browser) await browser.close();
        process.exit(1);
    }
}

run();
