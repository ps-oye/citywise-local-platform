import {deploymentInputs,checkDeployment} from './deployment-config.mjs';
try{console.log(JSON.stringify(await checkDeployment(await deploymentInputs(),{remote:!process.argv.includes('--offline')}),null,2));}
catch(error){console.error(error.message);process.exitCode=1;}
