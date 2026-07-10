const storeKey='mebel_sklad_data_v1';

function isPublicApp(){return typeof location!=='undefined'&&location.protocol!=='file:'}
function isDemoOrder(o){return String(o?.number||'')==='ORD-1001'&&String(o?.client||'')==='Демо клиент'}
function cleanStoredOrders(orders){return (orders||[]).filter(o=>!(isPublicApp()&&isDemoOrder(o)))}
function loadData(){try{const saved=localStorage.getItem(storeKey);if(saved){const parsed=JSON.parse(saved);return {materials:[],models:parsed.models||[],orders:cleanStoredOrders(parsed.orders),notifications:parsed.notifications||[],settings:parsed.settings||{}}}if(!isPublicApp()){const d=demoData();return {materials:[],models:d.models||[],orders:d.orders||[],notifications:[],settings:{}}}return {materials:[],models:[],orders:[],notifications:[],settings:{}}}catch(e){return {materials:[],models:[],orders:[],notifications:[],settings:{}}}}
function save(){try{localStorage.setItem(storeKey,JSON.stringify({materials:[],models:data.models||[],orders:cleanStoredOrders(data.orders),notifications:data.notifications||[],settings:data.settings||{}}))}catch(e){console.warn(e)}}
