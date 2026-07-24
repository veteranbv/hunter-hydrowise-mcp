#!/bin/bash
# Evidence driver: dependency hardening at the SHA below. No account access; local only.
cd "$(dirname "$0")"
SHA=$(git rev-parse --short HEAD)
echo "## evidence run @ $SHA ($(git log -1 --format=%s | cut -c1-58))"
A=$(npm audit 2>&1 | tail -1)
H=$(npm ls @hono/node-server 2>/dev/null | grep -o '@hono/node-server@[0-9.]*' | head -1)
E=$(npm ls esbuild 2>/dev/null | grep -o 'esbuild@[0-9.]*' | head -1)
T=$(npm test 2>&1 | grep -oE 'Tests  [0-9]+ passed' | head -1)
N12=$(npx -y npm@12 ci 2>&1 | grep -vE '^npm warn' | tail -1)
H12=$(npm ls @hono/node-server 2>/dev/null | grep -o '@hono/node-server@[0-9.]*' | head -1)
D=$(git diff --check && echo clean)
export SHA A H E T N12 H12 D
node -e '
const e=process.env;
const m={sha:e.SHA,cases:[
 {case:"npm audit (npm 11)",result:e.A,pass:e.A.includes("0 vulnerabilities")},
 {case:"resolved versions",hono:e.H,esbuild:e.E,pass:e.H==="@hono/node-server@2.0.11"&&e.E==="esbuild@0.28.1"},
 {case:"test suite",result:e.T,pass:e.T.includes("305 passed")},
 {case:"npm@12 ci then resolve",ci_tail:e.N12,hono:e.H12,pass:e.N12.includes("0 vulnerabilities")&&e.H12==="@hono/node-server@2.0.11"},
 {case:"git diff --check",result:e.D,pass:e.D==="clean"}
]};m.all_pass=m.cases.every(c=>c.pass);console.log(JSON.stringify(m,null,1));'
