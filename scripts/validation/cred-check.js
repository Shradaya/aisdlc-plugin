const {spawnSync}=require('child_process');
const want=[[2,'echo $BITBUCKET_API_TOKEN'],[2,'Write-Output $env:JIRA_API_TOKEN'],[0,'if ($env:BITBUCKET_API_TOKEN) { "set" } else { "missing" }'],[0,'[bool]$env:BITBUCKET_EMAIL']];
let bad=0;for(const [w,c] of want){const r=spawnSync('node',['hooks/pre-tool-policy.js'],{input:JSON.stringify({tool_name:'PowerShell',tool_input:{command:c},cwd:'.'}),encoding:'utf8'});if(r.status!==w)bad++;console.log(r.status===w?'PASS':'FAIL',r.status,c)}process.exit(bad?1:0)
