document.addEventListener('DOMContentLoaded',()=>{
  if(!window.auth?.requireAuth(['ADMIN']))return;
  const form=document.getElementById('adminCreateForm');
  const message=document.getElementById('adminCreateMessage');
  form.addEventListener('submit',async event=>{
    event.preventDefault(); message.hidden=true;
    const button=document.getElementById('adminCreateButton'); button.disabled=true;
    try{
      const password=document.getElementById('adminPassword').value;
      const confirmation=document.getElementById('adminPasswordConfirmation').value;
      if(password!==confirmation)throw new Error('Passwords do not match.');
      const result=await window.api.post('/admin/users',{name:document.getElementById('adminName').value.trim(),email:document.getElementById('adminEmail').value.trim(),mobile:document.getElementById('adminMobile').value.trim(),password});
      message.textContent=`Administrator ${result.name} was created successfully.`; message.className='login-message success'; message.hidden=false; form.reset();
    }catch(error){message.textContent=error.message||'Unable to create administrator.';message.className='login-message error';message.hidden=false;}
    finally{button.disabled=false;}
  });
});