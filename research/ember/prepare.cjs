// Patch and compile in this disposable lab's dependency directory only.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process'), ts = require('typescript');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const pkg = path.join(__dirname, 'node_modules/zigbee-herdsman');
if (require(pkg + '/package.json').version !== '10.10.0') throw Error('Expected pinned herdsman 10.10.0');
const original = fs.readFileSync(path.join(__dirname, 'upstream/emberAdapter.ts'), 'utf8').replace(/\n+$/, '\n');
if (sha(original) !== '78643e51d94c4ef41ea95da0d03895d664eb628ae94686c6a3951154c9284a94') throw Error('Unexpected upstream source');
const root = path.join(__dirname, 'build'), candidate = path.join(root, 'src/adapter/ember/adapter/emberAdapter.ts');
fs.mkdirSync(path.dirname(candidate), {recursive: true}); fs.writeFileSync(candidate, original);
execFileSync('patch', ['-p1', '-i', path.join(__dirname, 'receive-fragments.patch')], {cwd: root, stdio: 'inherit'});
const source = fs.readFileSync(candidate, 'utf8');
if (sha(source) !== '5eb721b3a4b16435dfca7f0b7791690f575a835d22dc48f8f72b6ba4ee68402c') throw Error('Patch differs from the published experiment');
const result = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, strict: true}, reportDiagnostics: true, fileName: 'emberAdapter.ts'});
if (result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw Error('Transpilation failed');
const dest = path.join(pkg, 'dist/adapter/ember/adapter/emberAdapter.experimental.js');
fs.writeFileSync(dest, result.outputText); fs.writeFileSync(dest.replace(/\.js$/, '.ts'), source);
console.log('Experiment prepared locally. No serial connection, firmware, or system installation changed.');
