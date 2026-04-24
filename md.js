const fs = require('fs');
const path = require('path');

// القائمة السوداء للملفات والمجلدات المستثناة
const IGNORE_LIST = ['.git', 'node_modules', '.DS_Store', 'md.js'];

function generateTree(dir, prefix = '') {
    let tree = '';
    const items = fs.readdirSync(dir);

    // فلترة العناصر المستثناة
    const filteredItems = items.filter(item => !IGNORE_LIST.includes(item));

    filteredItems.forEach((item, index) => {
        const itemPath = path.join(dir, item);
        const isLast = index === filteredItems.length - 1;
        const stats = fs.statSync(itemPath);

        tree += `${prefix}${isLast ? '└── ' : '├── '}${item}\n`;

        if (stats.isDirectory()) {
            tree += generateTree(itemPath, `${prefix}${isLast ? '    ' : '│   '}`);
        }
    });

    return tree;
}

const projectRoot = './';
const treeStructure = generateTree(projectRoot);
const markdownOutput = `\n## هيكل المشروع\n\n\`\`\`text\n${treeStructure}\`\`\`\n`;

const readmePath = 'README.md';

// التحقق من وجود الملف لإلحاق النص أو إنشائه من الصفر
if (fs.existsSync(readmePath)) {
    fs.appendFileSync(readmePath, markdownOutput);
    console.log('✅ تم إلحاق الهيكل بملف README.md بنجاح!');
} else {
    fs.writeFileSync(readmePath, `# عنوان المشروع\n${markdownOutput}`);
    console.log('✅ تم إنشاء ملف README.md وإضافة الهيكل بنجاح!');
}
