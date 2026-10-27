import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const out=await mkdtemp(join(tmpdir(),'mw-website-smoke-'));
try {
 const file=join(out,'manager.mjs');
 await build({
  entryPoints:['src/WebsiteManager.jsx'],bundle:true,platform:'node',
  format:'esm',outfile:file,external:['react','react-dom'],
  loader:{'.css':'empty'},logLevel:'warning'
 });
 // External React imports are resolved from project node_modules; copy generated
 // file into project root for correct module resolution.
 const {readFile,writeFile,unlink}=await import('node:fs/promises');
 const dest='./.website-manager-smoke.mjs';
 await writeFile(dest,await readFile(file));
 try {
  const {default:WebsiteManager}=await import(pathToFileURL(join(process.cwd(),dest)).href);
  const html=renderToStaticMarkup(React.createElement(WebsiteManager,{
   supabase:{from:()=>{throw new Error('Server render should not fetch backend');}}
  }));
  if(!html.includes('Hotel Website Management')||!html.includes('Add Service Card'))
    throw new Error('Hotel Website Management did not render its card controls');
  process.stdout.write('PASS: Website Manager renders without runtime ReferenceError\\n');
 } finally {await unlink(dest).catch(()=>{});}
} finally {await rm(out,{recursive:true,force:true});}
