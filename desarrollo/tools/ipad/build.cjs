const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '../..');
const original = fs.readFileSync(path.join(root, 'assets/nexus-workspace.js'), 'utf8');
const changes = {};
const replacements = {
  apiText: 'return window.NexusIPad.request(payload(text), signal);',
  speak: 'window.NexusIPad.speak(text);',
  dateLabel: 'return window.NexusIPad.dateLabel(value);',
  downloadBackup: 'window.NexusIPad.backup(backupObject());',
  importBackup: 'window.NexusIPad.importBackup(function(data){ return restore(data); });'
};
const adapted = babel.transformSync(original, {
  configFile: false, babelrc: false,
  plugins: [function () { return { visitor: {
    VariableDeclarator(p) {
      const name = p.node.id && p.node.id.name;
      if (replacements[name] && babel.types.isFunction(p.node.init)) {
        p.node.init.body = babel.types.blockStatement(babel.template.statements.ast(replacements[name]));
        changes[name] = (changes[name] || 0) + 1;
      }
    },
    FunctionDeclaration(p) {
      const name = p.node.id && p.node.id.name;
      if (replacements[name]) {
        p.node.body.body = babel.template.statements.ast(replacements[name]);
        changes[name] = (changes[name] || 0) + 1;
      }
      if (name === 'render') {
        p.node.body.body.push(babel.template.statement.ast('window.NexusIPad.afterRender(panel,currentTab);'));
        changes.render = (changes.render || 0) + 1;
      }
    },
    NewExpression(p) {
      if (p.node.callee.name === 'FormData') p.node.callee = babel.types.identifier('NexusFormData');
    },
    MemberExpression(p) {
      // Native HTMLFormElement named properties let <input name="id"> shadow form.id.
      if (!p.node.computed && babel.types.isIdentifier(p.node.object, { name: 'form' }) && babel.types.isIdentifier(p.node.property, { name: 'id' })) {
        p.replaceWith(babel.template.expression.ast('form.getAttribute("id")'));
        changes.formId = (changes.formId || 0) + 1;
      }
    },
    CatchClause(p) {
      const fn = p.getFunctionParent();
      if (fn && fn.node.id && fn.node.id.name === 'send') {
        p.node.body.body.unshift(babel.template.statement.ast('if(!draft) draft=text;'));
        changes.sendDraft = (changes.sendDraft || 0) + 1;
      }
    }
  }}; }],
  code: true, ast: false
}).code;
for (const name of [...Object.keys(replacements), 'render', 'sendDraft']) {
  if (changes[name] !== 1) throw new Error('The NEXUS source changed; inspect compatibility hook: ' + name);
}
if (changes.formId !== 9) throw new Error('Inspect form ID compatibility hooks: ' + changes.formId);
const output = babel.transformSync(adapted, {
  configFile: false, babelrc: false,
  presets: [[require.resolve('@babel/preset-env'), { targets: { safari: '9' }, modules: false, useBuiltIns: false, forceAllTransforms: true, bugfixes: true }]],
  compact: true, comments: false
}).code;
fs.mkdirSync(path.join(root, 'ipad/vendor'), { recursive: true });
fs.writeFileSync(path.join(root, 'ipad/workspace.js'), '/* Generated from assets/nexus-workspace.js; run tools/ipad/build.cjs. */\n' + output + '\n');
const promiseRoot = path.dirname(require.resolve('promise-polyfill/package.json'));
fs.copyFileSync(path.join(promiseRoot, 'dist/polyfill.min.js'), path.join(root, 'ipad/vendor/promise.min.js'));
fs.copyFileSync(path.join(promiseRoot, 'LICENSE'), path.join(root, 'ipad/vendor/PROMISE-LICENSE.txt'));
fs.copyFileSync(path.join(root, 'icon-192.png'), path.join(root, 'ipad/icon.png'));
console.log('Generated iPad workspace:', Buffer.byteLength(output), 'bytes; hooks:', Object.keys(changes).join(', '));
