import {deploymentInputs,checkDeployment} from './deployment-config.mjs';
try{console.log(JSON.stringify(await checkDeployment(await deploymentInputs(process.argv.includes('--production')?'production':'preview')),null,2));}
catch(error){console.error(error.message);process.exitCode=1;}
