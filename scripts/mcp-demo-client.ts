import { runDemoClient } from "../src/client/demo-client.js";
export { localEndpoint } from "../src/client/demo-client.js";
if (process.argv[1] && import.meta.filename === (await import("node:path")).resolve(process.argv[1])) {
  runDemoClient(process.argv.slice(2)).then(report => {
    console.log(JSON.stringify(report, null, 2));
  }).catch(() => {
    console.error("Independent demo client failed. Check the running loopback endpoint, selected tools and JSON arguments.");
    process.exitCode = 1;
  });
}
