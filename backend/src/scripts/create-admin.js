require('dotenv').config();
const bcrypt=require('bcryptjs');
const db=require('../config/database');

const required=['ADMIN_NAME','ADMIN_EMAIL','ADMIN_MOBILE','ADMIN_PASSWORD'];

(async()=>{
  const missing=required.filter(key=>!String(process.env[key]||'').trim());
  const password=String(process.env.ADMIN_PASSWORD||'');
  if(missing.length||password.length<12){
    console.error(`Set ${missing.join(', ')||'ADMIN_PASSWORD'}; ADMIN_PASSWORD must be at least 12 characters.`);
    process.exitCode=1;
    return;
  }
  try{
    const hash=await bcrypt.hash(password,12);
    await db.transaction(async client=>{
      const existing=await client.query('SELECT id FROM users WHERE mobile=$1 OR LOWER(email)=LOWER($2) LIMIT 1',[process.env.ADMIN_MOBILE.trim(),process.env.ADMIN_EMAIL.trim()]);
      if(existing.rowCount)throw new Error('An account already exists with the supplied admin email or mobile number.');
      const result=await client.query(`INSERT INTO users(name,mobile,email,password_hash,role,account_status,is_active) VALUES($1,$2,$3,$4,'ADMIN','ACTIVE',TRUE) RETURNING id`,[process.env.ADMIN_NAME.trim(),process.env.ADMIN_MOBILE.trim(),process.env.ADMIN_EMAIL.trim(),hash]);
      console.log(`Administrator created: ${result.rows[0].id}`);
    });
  }catch(error){
    console.error(`Unable to create administrator: ${error.message}`);
    process.exitCode=1;
  }finally{
    await db.close();
  }
})();