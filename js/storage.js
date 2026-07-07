const storeKey='mebel_sklad_data_v1';

function loadData(){try{const saved=localStorage.getItem(storeKey);if(saved){const parsed=JSON.parse(saved);return {materials:[],models:parsed.models||[],orders:parsed.orders||[]}}const d=demoData();return {materials:[],models:d.models||[],orders:d.orders||[]}}catch(e){return {materials:[],models:[],orders:[]}}}
function save(){try{localStorage.setItem(storeKey,JSON.stringify({materials:[],models:data.models||[],orders:data.orders||[]}))}catch(e){console.warn(e)}}
