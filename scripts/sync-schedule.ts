
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
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        // --- 1. Login to Client Portal ---
        console.log(`P1. Navigation to ${CLIENT_URL}...`);
        await page.goto(CLIENT_URL, { waitUntil: 'networkidle0' });

        // Selectors based on Screenshot analysis (Assumptions, might need adjustment if IDs differ)
        // Usually these inputs have specific names/ids. I'll try common guesses or TAB navigation if needed.
        // Assuming inputs are straightforward names based on label.

        // Wait for login form
        // Using explicit focus/type if selectors are tricky, but let's try broader selectors
        console.log('P2. Logging in...');

        // Type Agency, User, Password
        // Heuristic: Appears to be Agency, User, Password in order
        const inputs = await page.$$('input[type="text"], input[type="password"]');
        if (inputs.length >= 3) {
            await inputs[0].type(CLIENT_AGENCY);
            await inputs[1].type(CLIENT_USER);
            await inputs[2].type(CLIENT_PASS);
        } else {
            console.error('Could not find enough input fields!');
        }

        // Click Login Button - Find by value or text
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('input[type="button"], button, input[type="submit"]'));
            const loginBtn = buttons.find(b => {
                const val = (b as HTMLInputElement).value || b.textContent || '';
                return val.includes('Acessar o Sistema');
            });
            if (loginBtn) (loginBtn as HTMLElement).click();
        });

        await page.waitForNavigation({ waitUntil: 'networkidle0' });
        console.log('Login successful (assumed).');

        // --- 2. Navigate to "Escala Programada" ---
        console.log('P3. Navigating to Report...');

        // Find link by text "Escala Programada"
        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const target = links.find(l => l.textContent?.includes('Escala Programada'));
            if (target) target.click();
        });

        // Wait for the specific report page to load (look for "Pesquisar" button)
        await page.waitForFunction(() => {
            const bodyText = document.body.innerText;
            return bodyText.includes('Pesquisar') || bodyText.includes('Imprimir');
        }, { timeout: 15000 });

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
        try {
            await page.waitForNetworkIdle({ timeout: 5000 });
        } catch (e) {
            console.log('Network idle timeout, assuming results loaded.');
        }
        await new Promise(r => setTimeout(r, 2000)); // Grace period

        // --- 4. Print/Export ---
        console.log('P5. Exporting PDF...');

        // Click "Imprimir"
        // This likely opens a popup. We need to catch it.
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

        if (!printClicked) {
            console.error('Print button not found.');
            // Capture screenshot for debugging
            await page.screenshot({ path: 'debug-error.png' });
            throw new Error('Print button not found');
        }

        const newTarget = await newTargetPromise;
        const printPage = await newTarget.page();

        if (!printPage) {
            throw new Error('Print popup captured but page object is null.');
        }

        await printPage.bringToFront();
        await printPage.waitForNetworkIdle();

        const pdfPath = path.join(__dirname, 'schedule.pdf');

        // Generate PDF from the print page
        await printPage.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true,
            landscape: true // Reports are often landscape
        });

        console.log(`PDF Generated at ${pdfPath}`);

        await browser.close();

        // --- 5. Upload to BusManager ---
        console.log('P6. Uploading to BusManager...');

        // 5a. Login to BusManager to get Token
        const authRes = await axios.post(`${APP_URL}/api/auth/login`, {
            email: APP_EMAIL,
            password: APP_PASSWORD
        });

        // Extract token from cookie or response
        // Our API sets a cookie 'auth_token'. Axios might not auto-store it for next request unless configured with jar.
        // But the login route also returns user data. 
        // NOTE: The `auth/login` route in this project sets a HTTP-Only cookie. 
        // We cannot read it from `authRes.headers['set-cookie']` easily in client-side code, BUT in Node we CAN.

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

    } catch (error) {
        console.error('Fatal Error:', error);
        if (typeof page !== 'undefined') {
            await page.screenshot({ path: 'error-state.png', fullPage: true });
            console.log('Screenshot saved to error-state.png');
        }
        await browser.close();
        process.exit(1);
    }
}

run();
