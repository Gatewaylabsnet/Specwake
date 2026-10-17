import { createServer } from 'node:http';
export async function startMock(port = 0) {
  const server = createServer((req,res) => {
    const url = new URL(req.url!, 'http://127.0.0.1');
    res.setHeader('Content-Type','application/json');
    if (url.pathname === '/v1/pets') res.end(JSON.stringify({pets:[{id:'pet_001',name:'Miso',status:'available'},{id:'pet_002',name:'Pixel',status:'adopted'}].filter(p => !url.searchParams.has('status') || p.status === url.searchParams.get('status')), source:'Specwake deterministic mock'}));
    else if (/^\/v1\/pets\/[^/]+$/.test(url.pathname)) res.end(JSON.stringify({id:decodeURIComponent(url.pathname.split('/').at(-1)!),name:'Miso',status:'available',source:'Specwake deterministic mock'}));
    else if (url.pathname === '/v1/health') res.end(JSON.stringify({status:'ok',version:'1.0.0'}));
    else if (url.pathname === '/v1/redirect') { res.writeHead(302,{Location:'/v1/health'}); res.end(); }
    else if (url.pathname === '/v1/large') res.end(JSON.stringify({data:'x'.repeat(300000)}));
    else if (url.pathname === '/v1/slow') { const timer = setTimeout(() => res.end('{}'), 6000); res.on('close', () => clearTimeout(timer)); }
    else if (url.pathname === '/v1/secret') res.end(JSON.stringify({echo:req.headers.authorization}));
    else { res.statusCode = 404; res.setHeader('X-Specwake-Fixture','missing'); res.end(JSON.stringify({error:'No fixture for this route. Use the sample pet catalog to complete the mock test.'})); }
  });
  await new Promise<void>((resolve,reject) => {server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const address = server.address() as {port:number};
  return {server, target:{mode:'mock' as const,baseUrl:`http://127.0.0.1:${address.port}/v1`,allowedAddresses:['127.0.0.1'],allowInsecureHttp:false}, close:() => new Promise<void>(resolve => server.close(() => resolve()))};
}
