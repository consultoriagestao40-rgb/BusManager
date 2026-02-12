import puppeteer from 'puppeteer';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';

// Configs (Load from ENV)
const CLIENT_URL = 'https://rip.nspenha.com.br/retaguarda/index.phtml';
const CLIENT_AGENCY = process.env.CLIENT_AGENCY || '000000';
const CLIENT_USER = process.env.CLIENT_USER || 'JVS001';
const CLIENT_PASS = process.env.CLIENT_PASS || 'JVS@2026';

const APP_URL = process.env.APP_URL || 'https://bus-manager-nine.vercel.app'; // Update if domain changes
const APP_EMAIL = process.env.APP_EMAIL || 'admin@busmanager.com'; // User to perform the upload
const APP_PASSWORD = process.env.APP_PASSWORD || 'admin123';

async function run() {
    log('🚀 Starting Schedule Sync Bot (Enhanced Debugging)...');
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

        // Check if we are already logged in (Enter might have worked)
        const loggedIn = await page.evaluate(() => {
            return document.body.innerText.includes('Menus Disponíveis') || document.body.innerText.includes('Escala Programada') || document.body.innerText.includes('Encerrar Sessão');
        });

        if (loggedIn) {
            console.log('Login successful via Enter key.');
        } else {
            // Click Login Button inside the same frame (Backup)
            console.log('P3. Clicking Login (Backup)...');
            await targetFrame.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('input[type="button"], button, input[type="submit"], a, div[onclick], span[onclick]'));
                const loginBtn = buttons.find(b => {
                    const val = (b as HTMLInputElement).value || b.textContent || '';
                    return val.toLowerCase().includes('acessar') || val.toLowerCase().includes('login') || val.toLowerCase().includes('entrar');
                });
                if (loginBtn) {
                    console.log('Login button found, clicking...');
                    (loginBtn as HTMLElement).click();
                } else {
                    // Log what we found to debug
                    const buttonTexts = buttons.map(b => (b as HTMLInputElement).value || b.textContent || b.tagName).slice(0, 10);
                    console.warn('Login button not found in target frame. Available buttons:', buttonTexts);
                    // Do not throw error yet, maybe navigation is just slow
                }
            });
        }

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

        // --- Debug: Log all frames and their links ---
        console.log('P3.1 analyzing page structure...');
        const debugFrames = page.frames();
        console.log(`Found ${debugFrames.length} frames.`);

        let targetElement: any = null;
        targetFrame = null;

        for (const frame of debugFrames) {
            console.log(`Frame URL: ${frame.url()}`);
            try {
                // Get all links in this frame
                const links = await frame.evaluate(() => {
                    return Array.from(document.querySelectorAll('a')).map(a => ({
                        text: a.innerText || a.textContent || '',
                        href: a.href,
                        visible: (a.offsetWidth > 0 && a.offsetHeight > 0)
                    }));
                });

                console.log(`Frame has ${links.length} links.`);
                if (links.length > 0) {
                    console.log(`First 3 links: ${JSON.stringify(links.slice(0, 3))}`);
                }

                // Check for our target
                const found = links.find(l => l.text.includes('Escala Programada') || l.text.includes('532'));
                if (found) {
                    console.log(`🎯 TARGET FOUND in frame ${frame.url()}: "${found.text}"`);
                    targetFrame = frame;
                    // We need to re-select it in the handle context to click
                    targetElement = await frame.evaluateHandle(() => {
                        const all = Array.from(document.querySelectorAll('a'));
                        return all.find(a => {
                            const t = a.innerText || a.textContent || '';
                            return t.includes('Escala Programada') || t.includes('532');
                        });
                    });
                    break;
                }
            } catch (e) {
                console.log(`Error inspecting frame ${frame.url()}: ${e}`);
            }
        }

        if (targetElement) {
            console.log('Clicking target element...');

            // Setup listener for new popup window BEFORE clicking
            const newPagePromise = new Promise<any>(resolve => {
                const listener = (target: any) => resolve(target);
                browser.once('targetcreated', listener);
                // Fallback: remove listener if not fired in 5s? (handled by race below)
            });

            // Log the element we are about to click
            try {
                const elementHTML = await targetFrame.evaluate((el: HTMLElement) => el.outerHTML, targetElement);
                console.log(`Target Element HTML: ${elementHTML}`);
            } catch (e) { console.log('Could not log target HTML'); }

            try {
                // 1. Try standard click
                await targetElement.click({ timeout: 5000 });
            } catch (e) {
                console.log(`Standard click failed (${e}). Trying fallback methods...`);
                // 2. JS Click
                try {
                    console.log('Attempting JS Click...');
                    await targetFrame.evaluate((el: HTMLElement) => el.click(), targetElement);
                } catch (jsErr) {
                    console.log(`JS Click failed: ${jsErr}`);
                }
            }

            // Check if a popup was created
            console.log('Waiting for potential popup...');
            let reportPage = page; // Default to current page if no popup

            try {
                const newTarget = await Promise.race([
                    newPagePromise,
                    new Promise(r => setTimeout(r, 5000))
                ]);

                if (newTarget && newTarget.type() === 'page') {
                    console.log('🚀 POPUP DETECTED! Switching context to new page.');
                    const popup = await newTarget.page();
                    if (popup) {
                        reportPage = popup;
                        await reportPage.bringToFront();
                    }
                } else {
                    console.log('No popup detected within 5s. Assuming same-page or parent frame update.');
                    // If no popup, we might still be on the same page, so reportPage = page is correct.
                }

                // Proceed with reportPage
                // Note: The rest of the script needs to use 'reportPage' instead of 'page'
                // We will return/assign this wrapper context or simply duplicate the rest here?
                // Better to replace the subsequent code to use 'reportPage'.

                // --- Update subsequent steps to use reportPage ---
                // We'll throw an error here to force the "catch" if we want to stop, 
                // but actually we want to CONTINUE.
                // Since rewrite is blocked by size, I'll update the variable name in the next chunk.

                // HACK: We need to make 'page' refer to the new page for the rest of the script 
                // OR update the following lines. 
                // Simplest way: reassign 'page' variable if possible? 
                // 'page' is declared with 'let' at the top.
                if (reportPage !== page) {
                    page = reportPage;
                }

            } catch (e) {
                console.log('Error checking for popup:', e);
            }

        } else {
            console.log('Target NOT found in initial scan. Trying fallback menu...');

            // Look for "Menus Disponíveis do Sistema" in all frames
            console.log('P3.2 Searching for Menu button (Fallback)...');
            let menuClicked = false;

            for (const frame of debugFrames) {
                const clickedInFrame = await frame.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], div, span, a'));
                    const menuBtn = buttons.find(b => {
                        const val = b.textContent || (b as HTMLInputElement).value || '';
                        return val.includes('Menus Disponíveis do Sistema');
                    });
                    if (menuBtn) {
                        (menuBtn as HTMLElement).click();
                        return true;
                    }
                    return false;
                });

                if (clickedInFrame) {
                    console.log(`Menu button found and clicked in frame: ${frame.url()}`);
                    menuClicked = true;
                    break;
                }
            }

            if (menuClicked) {
                await new Promise(r => setTimeout(r, 3000));
                await page.screenshot({ path: 'menu-expanded.png' });

                // Retry search for Escala Programada
                console.log('Retrying search for Escala Programada after menu click...');
                // (Reuse recursive search logic or just fail to screenshot if not found)
                // Keep it simple for now: if we didn't see it first time, and menu clicked, we might need to re-scan.
            }

            // Re-scan frames
            for (const frame of page.frames()) {
                const found = await frame.evaluate(() => {
                    const target = Array.from(document.querySelectorAll('a')).find(a => (a.innerText || '').includes('Escala Programada'));
                    if (target) {
                        target.click();
                        return true;
                    }
                    return false;
                });
                if (found) {
                    targetElement = true; // Mark as found
                    break;
                }
            }

            if (!targetElement) {
                throw new Error('Link "Escala Programada" not found even after menu click fallback.');
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
        log(`Fatal Error: ${error}`);
        if (page) {
            try {
                await page.screenshot({ path: 'error-state.png', fullPage: true });
                log('Screenshot saved to error-state.png');
            } catch (screenErr) {
                log(`Failed to take screenshot: ${screenErr}`);
            }

            try {
                const html = await page.content();
                fs.writeFileSync('error-page.html', html);
                log('HTML dump saved to error-page.html');
            } catch (htmlErr) { }
        }
        if (browser) await browser.close();
        process.exit(1);
    }
}

run();
