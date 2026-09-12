document.addEventListener('DOMContentLoaded',()=>{
  const form=document.getElementById('adminLoginForm');
  if(!form)return;
  const message=document.getElementById('adminLoginMessage');
  const button=document.getElementById('adminLoginButton');
  const buttonText=document.getElementById('adminLoginButtonText');
  const loader=document.getElementById('adminLoginButtonLoader');
  const password=document.getElementById('adminPassword');
  document.getElementById('toggleAdminPassword')?.addEventListener('click',event=>{
    const visible=password.type==='text'; password.type=visible?'password':'text';
    event.currentTarget.setAttribute('aria-label',visible?'Show password':'Hide password');
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(message)message.hidden=true;
    button.disabled=true; buttonText.hidden=true; loader.hidden=false;
    try{
      const identifier=document.getElementById('adminIdentifier').value.trim();
      const passwordValue=password.value;
      if(!identifier||!passwordValue)throw new Error('Enter your administrator email/mobile and password.');
      const data=await window.api.post('/auth/admin-login',{identifier,password:passwordValue});
      window.api.setSession(data);
      window.location.href='admin-dashboard.html';
    }catch(error){
      message.textContent=error.message||'Unable to sign in as administrator.';
      message.className='login-message error'; message.hidden=false;
    }finally{button.disabled=false;buttonText.hidden=false;loader.hidden=true;}
  });
});