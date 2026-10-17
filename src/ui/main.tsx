import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ImportedSpec, Selection, Tool } from '../core/model.js';
import { inputSchema, NAME } from '../core/contracts.js';
import './style.css';
import {currentProbe,makeProbeReceipt,probeViewKey,sameProbeReceipt,type StoredProbe} from '../core/probe-context.js';
import Panel from './panel/Panel.js';

const steps = ['Import specification','Choose operations','Review tools','Test with mock','Export server'];
type Document = ImportedSpec & { documentId:string };
function Mark() {return <svg viewBox="0 0 36 36" aria-hidden="true"><path d="M7 11h13l9 7-9 7H7l9-7z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M7 18h9" stroke="currentColor" strokeWidth="2.5"/></svg>}
function App() {
  const [step,setStep] = useState(0);
  const [doc,setDoc] = useState<Document>();
  const [selections,setSelections] = useState<Selection[]>([]);
  const [active,setActive] = useState('');
  const [filter,setFilter] = useState('');
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [storedResult,setStoredResult] = useState<StoredProbe>();
  const generation = useRef(0);
  const [epoch,setEpoch] = useState(0);
  const [args,setArgs] = useState('{}');
  const [downloaded,setDownloaded] = useState(false);
  const [filename,setFilename] = useState('');
  const token = useRef('');
  const heading = useRef<HTMLHeadingElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const selected = selections.find(s => s.id === active) ?? selections[0];
  const operation = doc?.operations.find(o => o.id === selected?.id);
  const tool = operation && selected ? {...operation,...selected,operationId:operation.id} as Tool : undefined;
  const validation = selections.length === 0 ? 'Select at least one supported operation.' : selections.some(s => !NAME.test(s.name)) ? 'Tool names must start with a letter and contain 1–64 letters, digits, underscores or hyphens.' : new Set(selections.map(s => s.name)).size !== selections.length ? 'Every tool needs a unique name.' : selections.some(s => s.description.length > 2000) ? 'Descriptions must be at most 2,000 characters.' : '';
  async function request(path:string, data:unknown) {
    if (!token.current) token.current = (await (await fetch('/api/session')).json()).token;
    const response = await fetch(`/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Specwake-Token':token.current},body:JSON.stringify(data)});
    if (!response.ok) throw new Error((await response.json()).error || 'Action failed. Try again.');
    return response;
  }
  async function run(label:string, action:()=>Promise<void>) {
    setBusy(label);setError('');
    try {await action();} catch(e) {setError((e as Error).message);} finally {setBusy('');}
  }
  function go(next:number) {if(next<step)invalidateProbe();setStep(next);setError('');setTimeout(()=>heading.current?.focus(),0);}
  function defaults(id:string) {
    const op = doc?.operations.find(o => o.id === id);
    return JSON.stringify(Object.fromEntries((op?.parameters ?? []).filter(p => p.required || p.enum).map(p => [p.inputName,p.enum?.[0] ?? (p.type === 'string' ? 'pet_001' : p.type === 'boolean' ? true : 1)])),null,2);
  }
  async function load(source?:string, name='Pet Catalog · sample') {
    await run('Reading specification',async ()=>{
      const value = await (await request(source === undefined ? 'sample':'import',source === undefined ? {}:{source})).json();
      setDoc(value);setFilename(name);setSelections([]);setActive('');invalidateProbe();setDownloaded(false);go(1);
    });
  }
  async function readFile(value?:File) {
    if (!value) return;
    if (value.size > 1024*1024) {setError('Document exceeds the 1 MiB limit.');return;}
    await load(await value.text(),value.name);
  }
  function toggle(id:string) {
    const op=doc!.operations.find(o=>o.id===id)!;
    setSelections(current => current.some(s=>s.id===id) ? current.filter(s=>s.id!==id) : [...current,{id,name:op.name,description:op.description}]);
    invalidateProbe();setDownloaded(false);
  }
  function edit(field:'name'|'description',value:string) {
    setSelections(current=>current.map(s=>s.id===selected?.id ? {...s,[field]:value}:s));invalidateProbe();setDownloaded(false);
  }
  const payload = {documentId:doc?.documentId,selections};
  async function review(next:number) {await run('Validating tools',async()=>{await request('preview',payload);if(next===3){invalidateProbe();setActive(selected!.id);setArgs(defaults(selected!.id));}go(next);});}
  const viewKey=probeViewKey(doc?.documentId,selections,selected?.name,args);
  const result=currentProbe(storedResult,viewKey,epoch);
  const fixtureMissing=result?.result?.structuredContent?.error?.code==='SW_MOCK_FIXTURE_MISSING';
  const completed = !!result && !result.result?.isError;
  function invalidateProbe() {generation.current++;setEpoch(generation.current);setStoredResult(undefined);setDownloaded(false);}
  function chooseTool(id:string,resetArguments=false) {invalidateProbe();setActive(id);if(resetArguments)setArgs(defaults(id));}
  async function runMock() {
    await run('Connecting to MCP',async()=>{
      invalidateProbe();
      const requestEpoch=generation.current;
      const requestKey=viewKey;
      let parsed:Record<string,unknown>;
      try {parsed=JSON.parse(args);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();}
      catch {throw new Error('Arguments must be a JSON object. Correct the input and run the test again.');}
      const manifest={version:1 as const,tools:selections.map(selection=>{
        const {id,issues,...operation}=doc!.operations.find(item=>item.id===selection.id)!;
        return {...operation,operationId:id,name:selection.name,description:selection.description};
      })};
      try {
        const expected=await makeProbeReceipt(doc!.documentId,manifest,selected!.name,parsed);
        const value=await(await request('test',{...payload,toolName:selected!.name,args:parsed})).json();
        if(requestEpoch!==generation.current)return;
        if(!sameProbeReceipt(expected,value.receipt))throw new Error('The mock response no longer matches this configuration. Run the test again.');
        setStoredResult({key:requestKey,epoch:requestEpoch,response:value});
      } catch(error) {if(requestEpoch===generation.current)throw error;}
    });
  }
  const filteredOperations = doc?.operations.filter(o=>`${o.method} ${o.path} ${o.description}`.toLowerCase().includes(filter.toLowerCase())) ?? [];
  return <div className="app">
    <header><a className="brand" href="/" aria-label="Specwake home"><span className="brand-mark"><Mark/></span><strong>Specwake</strong><span className="family">by GatewayLabs</span></a><div className="header-right"><a className="text-button" href="/panel">MCP yönetim paneli ↗</a><span className="local"><i/> Local workspace</span><span className="version">MVP / 0.1</span></div></header>
    <div className="shell">
      <aside><div className="aside-label">OPENAPI → MCP</div><h2>Give your API<br/>a new interface.</h2><p className="aside-intro">A small, deliberate path from your specification to an MCP server.</p><nav aria-label="Build steps">{steps.map((label,i)=><button key={label} className={`step ${step===i?'active':''} ${i<step?'done':''}`} disabled={!!busy || i>step || i>0&&!doc} aria-current={step===i?'step':undefined} onClick={()=>go(i)}><span className="step-number">{i<step?'✓':String(i+1).padStart(2,'0')}</span><span>{label}</span>{step===i&&<span className="step-arrow">›</span>}</button>)}</nav><div className="aside-footer"><span className="tiny-square"/> Built on your machine.<br/><span>No account. No AI service required.</span></div></aside>
      <main aria-busy={!!busy}>
        <div className="eyebrow">SERVER BUILDER <span>/ {String(step+1).padStart(2,'0')}</span></div>
        <h1 ref={heading} tabIndex={-1}>{['Start with your specification.','Expose only what you choose.','Make these tools your own.','Try it before you connect it.','Your server. Ready to leave.'][step]}</h1>
        <p className="lead">{['Bring a local OpenAPI file. We’ll turn selected operations into tools your MCP client can use.','Nothing is selected by default. Review each operation before making it available to a client.','Review the names, descriptions and inputs your MCP client will see.','This sandbox calls only the bundled local fixture through a real stdio MCP connection.','Download an independent Node.js package with your selected tools and its own runtime.'][step]}</p>
        {error&&<div className="alert error" role="alert"><strong>We couldn’t complete that step.</strong><span>{error}</span><button className="text-button" onClick={()=>setError('')}>Dismiss</button></div>}
        {busy&&<div role="status" className="working"><span className="spinner"/>{busy}…</div>}
        {step===0&&<>
          <div className="import-grid"><section className="dropzone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)void readFile(e.dataTransfer.files[0]);}}><div className="file-icon">{'{ }'}<span>↥</span></div><h3>A specification is all you need.</h3><p>Drop your JSON or YAML file here<br/>or choose one from your computer.</p><input ref={file} type="file" accept=".json,.yaml,.yml" aria-label="OpenAPI file" onChange={e=>{void readFile(e.target.files?.[0]);e.target.value='';}}/><button className="primary" disabled={!!busy} onClick={()=>file.current?.click()}>Choose a local file <span>↗</span></button><small>OPENAPI 3.0 / 3.1 · MAX 1 MiB</small></section><section className="import-notes"><span className="tag">A FOCUSED START</span><h3>From endpoints <br/>to intentional tools.</h3><p>Select supported GET operations, refine their tool definitions, then test against a local mock.</p><div className="mini-flow"><span>OpenAPI</span><span>→</span><span>MCP tools</span><span>→</span><span>stdio</span></div><hr/><p className="note">Your file is processed on this machine. Imported server addresses are never contacted.</p></section></div>
          <button disabled={!!busy} className="sample" onClick={()=>void load()}><span className="sample-icon">◇</span><span><strong>Just exploring? Try the Pet Catalog.</strong><small>A bundled specification and deterministic mock. No credentials needed.</small></span><span>Load sample →</span></button>
          <div className="support-strip"><span>✓ Document-local $ref</span><span>✓ Explicit operation selection</span><span>✓ Standalone export</span></div>
        </>}
        {step===1&&doc&&<>
          <div className="document-bar"><div className="document-symbol">{ '{}' }</div><div><strong>{doc.title}</strong><small>{filename} <span>·</span> OpenAPI {doc.version}</small></div><span className="tag">{doc.operations.length} OPERATIONS</span></div>
          <div className="table-toolbar"><label className="search"><span>⌕</span><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Find a method, path or description" aria-label="Filter operations"/></label><span>{selections.length} selected</span></div>
          <div className="operations"><div className="table-heading"><span>OPERATION</span><span>SUPPORT</span></div>{doc.operations.filter(o=>`${o.method} ${o.path} ${o.description}`.toLowerCase().includes(filter.toLowerCase())).map(op=><label key={op.id} className={`operation ${op.issues.length?'unsupported':''}`}><input type="checkbox" checked={selections.some(s=>s.id===op.id)} disabled={!!op.issues.length} onChange={()=>toggle(op.id)} aria-label={`Select ${op.id}`}/><span className={`method ${op.method==='GET'?'get':''}`}>{op.method}</span><span className="operation-info"><code>{op.path}</code><small>{op.description}</small>{op.issues.length>0&&<small className="issue">{op.issues.join(' ')}</small>}</span><span className={`status ${op.issues.length?'blocked':''}`}>{op.issues.length?'Unavailable':op.auth.kind==='none'?'Supported':'Auth required'}</span></label>)}</div>
          {!filteredOperations.length&&<div className="sample"><span>No operations match this search.</span><button className="text-button" onClick={()=>setFilter('')}>Clear filter</button></div>}
          <p className="footnote">GET does not guarantee that an operation is harmless or its data is safe to share. Only explicitly selected operations enter the runtime.</p><div className="actions"><button className="secondary" onClick={()=>go(0)}>← Change file</button><button className="primary" disabled={!selections.length||!!busy} onClick={()=>void review(2)}>Review {selections.length||''} tools →</button></div>
        </>}
        {step===2&&tool&&<>
          <div className="review-grid"><div className="tool-list"><div className="aside-label">SELECTED TOOLS / {selections.length}</div>{selections.map(s=><button className={selected?.id===s.id?'chosen':''} key={s.id} onClick={()=>chooseTool(s.id)}><span>ƒ</span><span>{s.name}<small>{s.id}</small></span></button>)}</div><div className="editor"><div className="panel-title"><span className="tag">TOOL DEFINITION</span><span className="mono">{tool.method} {tool.path}</span></div><label className="field">Tool name<input value={selected!.name} maxLength={80} onChange={e=>edit('name',e.target.value)} spellCheck={false}/></label><label className="field">Description<textarea value={selected!.description} rows={3} onChange={e=>edit('description',e.target.value)}/></label><div className="schema-heading">INPUT SCHEMA <span>{tool.parameters.length} parameters</span></div><pre className="schema">{JSON.stringify(inputSchema(tool),null,2)}</pre><p className="note">{tool.auth.kind==='none'?'Authentication: none declared by this operation.':`Authentication required: ${tool.auth.kind}. Read only from the runtime environment; no secrets are collected here.`}</p></div></div>
          {validation&&<p role="alert" className="validation">{validation}</p>}<div className="actions"><button className="secondary" onClick={()=>go(1)}>← Choose operations</button><button className="primary" disabled={!!validation||!!busy} onClick={()=>void review(3)}>Test with local mock →</button></div>
        </>}
        {step===3&&tool&&<>
          <div className="sandbox-banner"><span className="sandbox-icon">◉</span><div><strong>LOCAL MOCK · TEST MODE</strong><p>Pet Catalog fixtures: /pets, /pets/{'{id}'}, /health. Other routes return a test error. No imported API is contacted; auth uses fake values.</p></div></div>
          <div className="test-grid"><section className="test-input"><label className="field">Selected tool<select value={selected!.id} onChange={e=>chooseTool(e.target.value,true)}>{selections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="field">Arguments <span className="field-hint">JSON · path_ and query_ prefixes</span><textarea className="code-input" rows={8} value={args} onChange={e=>{setArgs(e.target.value);invalidateProbe();}} spellCheck={false}/></label><button className="text-button" disabled={!!busy} onClick={()=>{invalidateProbe();setArgs(defaults(selected!.id));}}>Reset arguments</button><button className="primary" disabled={!!busy} onClick={()=>void runMock()}>Run mock test <span>▷</span></button></section><section className="test-output" aria-live="polite"><div className="panel-title"><span className="tag">MCP RESPONSE</span><span className={`status ${result?.result?.isError?'blocked':''}`}>{result?completed?'Passed':fixtureMissing?'No fixture':'Call rejected':'Awaiting test'}</span></div>{result?<><div className="handshake"><span>✓ initialize</span><span>✓ tools/list · {result.toolNames.length}</span><span>{completed?'✓':'×'} tools/call</span></div><p className="note">{fixtureMissing ? "No bundled fixture matches this route. Your real API was not contacted; export remains unverified." : "This result applies only to this tool, manifest and argument set. Mock calls do not verify real API authentication."}</p><pre>{JSON.stringify(result.result,null,2)}</pre></>:<div className="response-empty"><span>↔</span><h3>Meet your first tool call.</h3><p>Run the test to inspect a real MCP response<br/>from the local fixture.</p></div>}</section></div><div className="actions"><button className="secondary" onClick={()=>go(2)}>← Review tools</button><button className="primary" disabled={!!busy} onClick={()=>go(4)}>Prepare export →</button></div>
        </>}
        {step===4&&<>
          <div className="export-grid"><section className="export-package"><div className="package-icon">◇</div><span className="tag">STANDALONE NODE.JS PACKAGE</span><h2>specwake-server.zip</h2><p>{selections.length} explicitly selected tools.<br/>One independent stdio runtime.</p><div className="package-files"><span>src/ <small>Runtime + validation</small></span><span>tools.json <small>Your selected definitions</small></span><span>package.json + lockfile <small>Pinned dependencies</small></span><span>README + target example <small>Setup and safety boundaries</small></span></div><button className="primary" disabled={!!busy} onClick={()=>void run('Packaging server',async()=>{const response=await request('export',payload);const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download='specwake-server.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setDownloaded(true);})}>{downloaded?'Download again':'Download server package'} <span>↓</span></button>{downloaded&&<p role="status" className="success">✓ Package downloaded. Follow the setup instructions.</p>}</section><section className="export-setup"><h3>A few steps on the other side.</h3><ol><li><strong>Extract and install.</strong><p>Node.js 24+ is required. npm downloads dependencies.</p><pre>npm ci<br/>npm run build</pre></li><li><strong>Configure a deliberate target.</strong><p>Copy target.example.json to target.json. Set the fixed base URL and exact permitted IPs. Supply any credential through environment variables.</p></li><li><strong>Connect your MCP client.</strong><p>Launch in the extracted package directory:</p><pre>node dist/runtime/cli.js</pre></li></ol><div className={`export-test ${completed?'success':''}`}>{completed?('✓ '+selected!.name+' passed for the current arguments.'):'No successful mock call recorded for this configuration.'}<br/><span>Mock results do not verify a real API or its credentials.</span></div></section></div><p className="footnote">Local-first authoring: your specification stays on this machine. A connected MCP client may send returned API data to its AI provider. Review its policies before using sensitive data.</p><div className="actions"><button className="secondary" onClick={()=>go(3)}>← Back to mock test</button><button className="text-button" onClick={()=>go(1)}>Change selected operations</button></div>
        </>}
        <footer><span>SPECWAKE</span><span>Local by design. Explicit by default.</span><span>stdio transport</span></footer>
      </main>
    </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(location.pathname === '/panel' ? <Panel/> : <App/>);
