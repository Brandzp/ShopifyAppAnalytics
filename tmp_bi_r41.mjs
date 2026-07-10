const fs=require('fs');
const sec=JSON.parse(fs.readFileSync('C:/Work/AgentsTeam/config/secrets.json','utf8'));
process.env.DATABASE_URL=sec.brands['brandzpAnalyticsProd'].databaseUrl;
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  try{
    const now=new Date('2026-07-09T23:59:59Z');
    const w0s=new Date('2026-07-02T00:00:00Z');
    const w1s=new Date('2026-06-25T00:00:00Z');
    const w1e=new Date('2026-07-02T00:00:00Z');
    const [cur,pri,sync,refCur,refPri,custCur]=await Promise.all([
      p.order.aggregate({_count:true,_sum:{totalPrice:true,totalDiscounts:true},where:{test:false,createdAt:{gte:w0s,lte:now}}}),
      p.order.aggregate({_count:true,_sum:{totalPrice:true,totalDiscounts:true},where:{test:false,createdAt:{gte:w1s,lt:w1e}}}),
      p.syncRun.findFirst({orderBy:{startedAt:'desc'}}),
      p.refund.aggregate({_count:true,_sum:{refundedAmount:true},where:{createdAt:{gte:w0s,lte:now}}}),
      p.refund.aggregate({_count:true,_sum:{refundedAmount:true},where:{createdAt:{gte:w1s,lt:w1e}}}),
      p.customer.count({where:{createdAt:{gte:w0s,lte:now},isReturning:false}})
    ]);
    console.log('CUR',JSON.stringify(cur));
    console.log('PRI',JSON.stringify(pri));
    console.log('SYNC',JSON.stringify(sync));
    console.log('REF_CUR',JSON.stringify(refCur));
    console.log('REF_PRI',JSON.stringify(refPri));
    console.log('NEW_CUST_CUR',custCur);
  }catch(e){console.error('ERR',e.message)}
  finally{await p.$disconnect()}
})()
