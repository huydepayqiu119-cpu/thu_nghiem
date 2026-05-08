const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');

const BETA_EXE_API = process.env.BETA_EXE_API || 'http://localhost:45678';

async function main() {
    const blueprintsDir = process.argv[2] || 'pack/blueprints';
    const outputPath = process.argv[3] || 'staging/meg4.zip';
    
    console.log('[meg4] Starting MEG4 export via Beta EXE API...');
    console.log('[meg4] Input:', blueprintsDir);
    console.log('[meg4] Output:', outputPath);
    console.log('[meg4] API:', BETA_EXE_API);
    
    if (!fs.existsSync(blueprintsDir)) {
        console.error('[meg4] Blueprints directory not found');
        process.exit(1);
    }
    
    const subDirs = fs.readdirSync(blueprintsDir).filter(f => {
        const fullPath = path.join(blueprintsDir, f);
        return fs.statSync(fullPath).isDirectory();
    });
    
    if (subDirs.length === 0) {
        console.error('[meg4] No subdirectories found');
        process.exit(1);
    }
    
    console.log(`[meg4] Found ${subDirs.length} subdirectories: ${subDirs.join(', ')}`);
    
    console.log('[meg4] Checking Beta EXE API...');
    try {
        const healthResponse = await fetch(`${BETA_EXE_API}/api/meg4/health`, {
            timeout: 5000
        });
        
        if (!healthResponse.ok) {
            throw new Error('API not responding');
        }
        
        const healthData = await healthResponse.json();
        console.log('[meg4] Beta EXE API:', healthData.message);
    } catch (error) {
        console.error('[meg4] Beta EXE API not available:', error.message);
        console.error('[meg4] Please make sure Beta EXE app is running on the user machine');
        process.exit(1);
    }
    
    const outputZips = [];
    const tempDir = path.join(__dirname, 'temp_meg4');
    fs.mkdirSync(tempDir, { recursive: true });
    
    for (const subDir of subDirs) {
        const subDirPath = path.join(blueprintsDir, subDir);
        const files = fs.readdirSync(subDirPath).filter(f => f.endsWith('.bbmodel'));
        
        if (files.length === 0) {
            console.log(`[meg4] ${subDir}: No .bbmodel files, skipping`);
            continue;
        }
        
        console.log(`[meg4] Processing ${subDir} (${files.length} files)`);
        
        const filesData = [];
        for (const file of files) {
            const filePath = path.join(subDirPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            filesData.push({
                filename: file,
                content: content
            });
        }
        
        console.log(`[meg4] Sending ${files.length} files to Beta EXE API...`);
        
        try {
            const convertResponse = await fetch(`${BETA_EXE_API}/api/meg4/convert`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: filesData,
                    subdirName: subDir
                }),
                timeout: 300000
            });
            
            if (!convertResponse.ok) {
                const errorData = await convertResponse.json();
                throw new Error(errorData.error || 'Conversion failed');
            }
            
            const result = await convertResponse.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Conversion failed');
            }
            
            const zipPath = path.join(tempDir, `${subDir}.zip`);
            const zipBuffer = Buffer.from(result.content, 'base64');
            fs.writeFileSync(zipPath, zipBuffer);
            
            console.log(`[meg4] ✓ Exported ${subDir}.zip (${result.size} bytes)`);
            outputZips.push(zipPath);
            
        } catch (error) {
            console.error(`[meg4] Failed to convert ${subDir}:`, error.message);
        }
    }
    
    if (outputZips.length === 0) {
        console.error('[meg4] No models were exported');
        process.exit(1);
    }
    
    console.log(`[meg4] Creating final zip from ${outputZips.length} files...`);
    const finalZip = new AdmZip();
    for (const zipPath of outputZips) {
        const zipData = fs.readFileSync(zipPath);
        finalZip.addFile(path.basename(zipPath), zipData);
    }
    
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    finalZip.writeZip(outputPath);
    
    const finalSize = fs.statSync(outputPath).size;
    console.log(`[meg4] ✓ Final output: ${outputPath} (${finalSize} bytes)`);
    
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    console.log('[meg4] Done!');
}

main().catch(error => {
    console.error('[meg4] Error:', error.message);
    process.exit(1);
});
