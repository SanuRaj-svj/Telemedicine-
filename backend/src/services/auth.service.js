const bcrypt = require('bcryptjs');
const db = require('../config/database');
const userRepository = require('../repositories/user.repository');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const crypto = require('crypto');
const doctorDocs = require('../repositories/doctorDocument.repository');
const { ConflictError, AuthenticationError, ValidationError } = require('../utils/errors');
const { generatePatientCode } = require('../utils/patientCode');

function normalizeMobile(v){ if(!v) return null; const s=String(v).trim().replace(/\s+/g,''); return s.replace(/^\+91/,'').replace(/^91(?=\d{10}$)/,''); }
function normalizeEmail(v){ return v ? String(v).trim().toLowerCase() : null; }
function normalizeGender(v){ const g=String(v||'').trim().toUpperCase(); if(g==='MALE') return 'Male'; if(g==='FEMALE') return 'Female'; if(g==='OTHER') return 'Other'; if(g==='PREFER_NOT_TO_SAY') return 'Other'; return null; }
function publicUser(u){ return {id:u.id,name:u.name,email:u.email,mobile:u.mobile,role:u.role,accountStatus:u.accountStatus,organizationId:u.organizationId,healthCenterId:u.healthCenterId}; }
function hashRefreshToken(token){ return crypto.createHash('sha256').update(token).digest('hex'); }
async function persistRefreshToken(userId, token){ const decoded=verifyRefreshToken(token); const expiresAt=new Date(decoded.exp*1000).toISOString(); await db.query('INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,$3)',[userId,hashRefreshToken(token),expiresAt]); return decoded; }
function assertPassword(p){ if(typeof p!=='string'||p.length<8||p.length>128) throw new ValidationError('Password must be 8 to 128 characters'); }
async function registerUser(data){
 const role=String(data.role||'').toUpperCase(); if(!['PATIENT','ASHA','DOCTOR'].includes(role)) throw new ValidationError('Invalid registration role');
 assertPassword(data.password); const mobile=normalizeMobile(data.mobile), email=normalizeEmail(data.email), gender=normalizeGender(data.gender);
 if(!mobile) throw new ValidationError('Mobile number is required');
 if(mobile && !/^\d{10}$/.test(mobile)) throw new ValidationError('Mobile number must be a valid 10-digit number');
 if(email && !/^\S+@\S+\.\S+$/.test(email)) throw new ValidationError('Invalid email address');
 const existing=mobile?await userRepository.findByMobile(mobile):null; if(existing) throw new ConflictError('An account with this mobile number already exists');
 if(email && await userRepository.findByEmail(email)) throw new ConflictError('An account with this email already exists');
 const name=String(data.name||`${data.firstName||''} ${data.lastName||''}`).trim(); if(name.length<2) throw new ValidationError('Full name is required');
 const accountStatus=role==='PATIENT'?'ACTIVE':'PENDING_APPROVAL';
 const passwordHash=await bcrypt.hash(data.password,Number(process.env.BCRYPT_ROUNDS||12));
 let patient;
 const result=await db.transaction(async client=>{
   const user=await userRepository.create({name,mobile,email,passwordHash,role,accountStatus},client);
  if(role==='PATIENT') { const age=data.age||(()=>{if(!data.dateOfBirth)return 18;const d=new Date(data.dateOfBirth);if(Number.isNaN(d.getTime()))return 18;const now=new Date();return Math.max(0,now.getFullYear()-d.getFullYear()-((now.getMonth()<d.getMonth()||now.getMonth()===d.getMonth()&&now.getDate()<d.getDate())?1:0))})(); const patientRow=await client.query(`INSERT INTO patients(user_id,patient_code,name,age,gender,mobile,village,address,emergency_contact,blood_group,allergies,existing_conditions,medical_history,created_by,health_center_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$1,$14) RETURNING id,patient_code,name,age,gender,mobile,village,address,emergency_contact,blood_group,allergies,existing_conditions,medical_history,health_center_id,sync_status,created_at,updated_at`,[user.id,generatePatientCode(),name,age,gender||'Other',mobile||'',data.village||'Not specified',data.address||null,data.emergencyContact||null,data.bloodGroup||'Unknown',data.allergies||'None',data.existingConditions||'None',data.medicalHistory||'None',data.healthCenterId||null]); patient=patientRow.rows[0]; }
   if(role==='ASHA') await client.query(`INSERT INTO asha_applications(user_id,application_data,status) VALUES($1,$2,'PENDING')`,[user.id,JSON.stringify(data)]);
   if(role==='DOCTOR') {
     const appRow=await client.query(`INSERT INTO doctor_applications(user_id,full_name,mobile,email,qualification,license_number,specialization,experience_years,preferred_center_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING') RETURNING id`,[user.id,name,mobile||'',email||'',data.qualification||'Not provided',data.medicalRegistrationNumber||data.licenseNumber||`PENDING-${user.id}`,data.specialization||'General Medicine',Number(data.experience||data.experienceYears||0),data.healthCenterId||data.preferredCenterId||null]);
     const documents=Array.isArray(data.documents)?data.documents:[];
     const allowed={REGISTRATION:['application/pdf','image/jpeg','image/png'],QUALIFICATION:['application/pdf','image/jpeg','image/png'],OTHER:['application/pdf','image/jpeg','image/png']};
     for(const doc of documents){
       const type=String(doc.type||'').toUpperCase();
       if(!allowed[type]||!allowed[type].includes(String(doc.mimeType||'').toLowerCase())) throw new ValidationError('Unsupported verification document type');
       if(!doc.name||!doc.data) throw new ValidationError('Verification document is incomplete');
       const raw=String(doc.data).replace(/^data:[^;]+;base64,/,'');
       const content=Buffer.from(raw,'base64');
       if(!content.length||content.length>5*1024*1024) throw new ValidationError('Each verification document must be between 1 byte and 5 MB');
       const mime=String(doc.mimeType||'').toLowerCase();
       const magicOk=(mime==='application/pdf'&&content.subarray(0,4).toString()==='%PDF')||(mime==='image/jpeg'&&content.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))||(mime==='image/png'&&content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
       if(!magicOk) throw new ValidationError('Verification document content does not match its declared file type');
       const sha256=crypto.createHash('sha256').update(content).digest('hex');
       await doctorDocs.create({applicationId:appRow.rows[0].id,userId:user.id,documentType:type,originalName:String(doc.name).slice(0,255),mimeType:String(doc.mimeType).toLowerCase(),fileSizeBytes:content.length,sha256,content},client);
     }
     if(documents.length<2) throw new ValidationError('Registration proof and qualification certificate are required');
   }
   return user;
 });
 return {user:publicUser(result),...(role==='PATIENT'?{patient:{id:patient.id,patientCode:patient.patient_code,name:patient.name,age:patient.age,gender:patient.gender,mobile:patient.mobile,village:patient.village,address:patient.address,emergencyContact:patient.emergency_contact,bloodGroup:patient.blood_group,allergies:patient.allergies,existingConditions:patient.existing_conditions,medicalHistory:patient.medical_history,healthCenterId:patient.health_center_id,syncStatus:patient.sync_status,createdAt:patient.created_at,updatedAt:patient.updated_at}}:{}),requiresApproval:accountStatus!=='ACTIVE'};
}
async function login(identifier,password){
 const id=String(identifier||'').trim(); assertPassword(password); if(!id) throw new AuthenticationError('Email or mobile number is required');
 const user=await userRepository.findByIdentifier(normalizeMobile(id) || id); if(!user) throw new AuthenticationError('Invalid email/mobile or password');
 const ok=await bcrypt.compare(password,user.passwordHash||''); if(!ok) throw new AuthenticationError('Invalid email/mobile or password');
 if(user.accountStatus==='PENDING_APPROVAL'||user.accountStatus==='PENDING'||user.accountStatus==='UNDER_REVIEW') { const e=new Error('Your account is pending administrative approval');e.code='ACCOUNT_PENDING_APPROVAL';throw e; }
 if(['SUSPENDED','DISABLED','DEACTIVATED'].includes(user.accountStatus)||user.isActive===false){const e=new Error('Your account is disabled');e.code='ACCOUNT_DISABLED';throw e;}
 if(user.accountStatus==='REJECTED'){const e=new Error('Your account application was rejected');e.code='ACCOUNT_REJECTED';throw e;}
 const fresh=await userRepository.touchLogin(user.id); const accessToken=generateAccessToken(fresh); const refreshToken=generateRefreshToken(fresh);
 await persistRefreshToken(fresh.id, refreshToken);
 return {user:publicUser(fresh),accessToken,refreshToken};
}
async function refreshSession(refreshToken){
 if(!refreshToken) throw new AuthenticationError('Refresh token is required');
 const decoded=verifyRefreshToken(refreshToken);
 const tokenHash=hashRefreshToken(refreshToken);
 const row=await db.query('SELECT id,user_id FROM refresh_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1',[tokenHash]);
 if(!row.rowCount || row.rows[0].user_id!==decoded.sub) throw new AuthenticationError('Refresh token has been revoked or expired');
 await db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1',[row.rows[0].id]);
 const user=await userRepository.findById(decoded.sub);
 if(!user || user.accountStatus!=='ACTIVE' || user.isActive===false) throw new AuthenticationError('Account is not active');
 const accessToken=generateAccessToken(user); const nextRefresh=generateRefreshToken(user); await persistRefreshToken(user.id,nextRefresh);
 return {user:publicUser(user),accessToken,refreshToken:nextRefresh};
}
async function logoutSession(refreshToken){ if(refreshToken) await db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL',[hashRefreshToken(refreshToken)]); return true; }
async function getCurrentUser(id){const u=await userRepository.findById(id); if(!u) throw new Error('User not found'); return publicUser(u);}
module.exports={registerUser,registerPatient:data=>registerUser({...data,role:'PATIENT'}),registerProfessional:registerUser,login,refreshSession,logoutSession,getCurrentUser};
