const fs=require('fs');
const sec=JSON.parse(fs.readFileSync('C:/Work/AgentsTeam/config/secrets.json','utf8'));
process.env.DATABASE_URL=sec.brands['brandzpAnalyticsProd'].databaseUrl;
const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  try{
    const d7=new Date('2026-06-22T00:00:00Z');
    const d7e=new Date('2026-06-29T23:59:59Z');
    const d7pS=new Date('2026-06-15T00:00:00Z');
    const d7pE=new Date('2026-06-22T00:00:00Z');
    const ads7=await p.metaAdsCampaignInsight.aggregate({
      _sum:{spend:true,impressions:true,clicks:true,purchases:true,purchaseRoas:true},
      where:{dateStart:{gte:d7,lte:d7e}}
    });
    console.log('ADS7_CUR',JSON.stringify(ads7._sum));
    const ads7p=await p.metaAdsCampaignInsight.aggregate({
      _sum:{spend:true,impressions:true,clicks:true,purchases:true,purchaseRoas:true},
      where:{dateStart:{gte:d7pS,lt:d7pE}}
    });
    console.log('ADS7_PRV',JSON.stringify(ads7p._sum));
    const ref7=await p.refund.aggregate({
      _count:true,
      _sum:{refundedAmount:true},
      where:{createdAt:{gte:d7,lte:d7e}}
    });
    console.log('REF7',JSON.stringify(ref7));
  }catch(e){console.error('ERR',e.message)}
  finally{await p['$disconnect']()}
})()
