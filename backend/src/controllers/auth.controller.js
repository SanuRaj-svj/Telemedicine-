const env=require('../config/env');
const cookieOptions=()=>`Path=/; HttpOnly; SameSite=Lax${env.NODE_ENV==='production'?'; Secure':''}`;
function setRefreshCookie(res,token){if(token)res.setHeader('Set-Cookie',`nabha_refresh_token=${encodeURIComponent(token)}; ${cookieOptions()}`);}
function clearRefreshCookie(res){res.setHeader('Set-Cookie',`nabha_refresh_token=; Max-Age=0; ${cookieOptions()}`);}
const authService=require('../services/auth.service');
const passwordResetService=require('../services/password-reset.service');
const ok=(res,data,status=200)=>res.status(status).json({success:true,data});
const fail=(res,e)=>{let status=e.statusCode||400; if(e.code==='ACCOUNT_PENDING_APPROVAL'||e.code==='ACCOUNT_DISABLED'||e.code==='ACCOUNT_REJECTED')status=403; return res.status(status).json({success:false,error:{code:e.code||'AUTH_ERROR',message:e.message||'Request failed'}});};
async function register(req,res){try{return ok(res,await authService.registerUser(req.body),201)}catch(e){return fail(res,e)}}
async function login(req,res){try{const data=await authService.login(req.body.identifier,req.body.password);setRefreshCookie(res,data.refreshToken);return ok(res,data)}catch(e){return fail(res,e)}}
async function adminLogin(req,res){try{const data=await authService.adminLogin(req.body.identifier,req.body.password);setRefreshCookie(res,data.refreshToken);return ok(res,data)}catch(e){return fail(res,e)}}
async function me(req,res){try{return ok(res,{user:await authService.getCurrentUser(req.user.id)})}catch(e){return fail(res,e)}}
async function refresh(req,res){try{const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('nabha_refresh_token='));const token=cookie?decodeURIComponent(cookie.slice('nabha_refresh_token='.length)):req.body?.refreshToken;const data=await authService.refreshSession(token);setRefreshCookie(res,data.refreshToken);return ok(res,data)}catch(e){return fail(res,e)}}
async function logout(req,res){try{const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('nabha_refresh_token='));const token=cookie?decodeURIComponent(cookie.slice('nabha_refresh_token='.length)):req.body?.refreshToken;const result=await authService.logoutSession(token);clearRefreshCookie(res);return ok(res,result)}catch(e){return fail(res,e)}}
async function forgotPassword(req,res){try{return ok(res,await passwordResetService.requestReset(req.body?.email))}catch(e){return fail(res,e)}}
async function resetPassword(req,res){try{return ok(res,await passwordResetService.resetPassword(req.body?.token,req.body?.password))}catch(e){return fail(res,e)}}
module.exports={register,login,adminLogin,me,refresh,logout,forgotPassword,resetPassword};
