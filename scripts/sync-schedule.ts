
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

        // Disable navigation timeout or increase it
        page.setDefaultNavigationTimeout(60000);

        // --- 1. Login to Client Portal ---
        console.log(`P1. Navigation to ${CLIENT_URL}...`);
        await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' }); // Faster than networkidle0

        // Type Agency, User, Password
        console.log('P2. Filling Credentials...');
        try {
            const inputs = await page.$$('input[type="text"], input[type="password"]');
            if (inputs.length >= 3) {
                await inputs[0].type(CLIENT_AGENCY);
                await inputs[1].type(CLIENT_USER);
                await inputs[2].type(CLIENT_PASS);
            } else {
                throw new Error(`Found only ${inputs.length} inputs, expected 3`);
            }
        } catch (e) {
            console.error('Error finding inputs:', e);
            throw e;
        }

        // Click Login Button
        console.log('P3. Clicking Login...');
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('input[type="button"], button, input[type="submit"]'));
            const loginBtn = buttons.find(b => {
                const val = (b as HTMLInputElement).value || b.textContent || '';
                return val.includes('Acessar o Sistema');
            });
            if (loginBtn) (loginBtn as HTMLElement).click();
            else throw new Error('Login button not found');
        });

        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        console.log('Login successful (assumed).');

        // --- 2. Navigate to "Escala Programada" ---
        console.log('P3. Navigating to Report...');

        const linkFound = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const target = links.find(l => l.textContent?.includes('Escala Programada'));
            if (target) {
                target.click();
                return true;
            }
            return false;
        });

        if (!linkFound) {
            // Check frame?
            console.log('Link not found in top frame. Taking screenshot.');
            throw new Error('Link "Escala Programada" not found');
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
