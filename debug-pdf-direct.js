try {
    const pdf = require('pdf-parse/lib/pdf-parse.js');
    console.log('Type of require("pdf-parse/lib/pdf-parse.js"):', typeof pdf);
    console.log('Success! No ENOENT error on require.');
} catch (e) {
    console.error('Error requiring pdf-parse/lib/pdf-parse.js:', e.message);
}
