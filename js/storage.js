const storeKey='mebel_sklad_data_v1';

function loadData(){try{const saved=localStorage.getItem(storeKey);if(saved){const parsed=JSON.parse(saved);return {materials:[],models:parsed.models||[],orders:parsed.orders||[],notifications:parsed.notifications||[],settings:parsed.settings||{}}}const d=demoData();return {materials:[],models:d.models||[],orders:d.orders||[],notifications:[],settings:{}}}catch(e){return {materials:[],models:[],orders:[],notifications:[],settings:{}}}}
function save(){try{localStorage.setItem(storeKey,JSON.stringify({materials:[],models:data.models||[],orders:data.orders||[],notifications:data.notifications||[],settings:data.settings||{}}))}catch(e){console.warn(e)}}
