import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
const python=process.env.THREADROOM_PYTHON||(existsSync('.venv/bin/python')?'.venv/bin/python':'python3');
for (const [command,args] of [[python,['-m','unittest','discover','-s','tests','-p','test_*.py']], [process.execPath,['--test','tests/pes-roundtrip.test.mjs','tests/dev-launcher.test.mjs','tests/curves.test.mjs','tests/shapes.test.mjs','tests/groups.test.mjs','tests/layers.test.mjs','tests/text.test.mjs','tests/project.test.mjs','tests/drag.test.mjs','tests/check.test.mjs','tests/thread.test.mjs']]]) {
  const result=spawnSync(command,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
