(function () {
  'use strict';

  const ROLE = window.NABHA_DASHBOARD_ROLE || document.getElementById('main-content')?.dataset.role || 'PATIENT';
  const state = { data: null, notifications: [], patientRequests: [], patientFilter: 'ALL', queueFilter: 'ALL', search: '', admin:{items:[],pagination:null,search:'',status:'PENDING',role:'ALL',sort:'created_at',order:'asc',page:1,requests:[],requestStatus:'REQUESTED',doctors:[]}, loading:false };
  const roleMeta = {
    PATIENT: { title: 'My Health', subtitle: 'Your appointments, health records and care at a glance.', eyebrow: 'Personal health workspace' },
    ASHA: { title: 'Field Operations', subtitle: 'Manage village visits, patients, priority cases and synchronization.', eyebrow: 'ASHA field workspace' },
    DOCTOR: { title: 'Clinical Workspace', subtitle: 'Prioritize today’s queue and move safely from triage to consultation.', eyebrow: 'Doctor clinical workspace' },
    ADMIN: { title: 'Health Operations', subtitle: 'Monitor people, care delivery, approvals and platform activity.', eyebrow: 'Administration workspace' }
  };

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const fmtDate = (value, withTime = true) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(d);
  };
  const initials = (name) => String(name || 'U').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'U';
  const riskClass = (risk) => `badge-soft badge-${String(risk || 'low').toLowerCase()}`;
  const riskLabel = (risk) => risk ? String(risk).replace('_', ' ') : 'No triage';
  const statusBadge = (status) => `<span class="badge-soft badge-status">${esc(String(status || 'UNKNOWN').replace('_', ' '))}</span>`;
  const valueOrDash = (v, suffix = '') => v === null || v === undefined || v === '' ? '—' : `${esc(v)}${suffix}`;

  let loadingTimer;
  function setLoading(loading, message) {
    const node = document.getElementById('state');
    const content = document.getElementById('content');
    if (!node || !content) return;
    if (loading) {
      clearTimeout(loadingTimer); state.loading=true; node.hidden = false;
      node.className = 'dashboard-loading';
      node.innerHTML = `<div class="loading-spinner" aria-hidden="true"></div><div><strong>${esc(message || 'Loading your dashboard')}</strong><p>Fetching the latest information securely from the server.</p></div>`;
      if(!state.data) content.hidden = false;
      loadingTimer=setTimeout(()=>{if(state.loading)showError(new Error('The dashboard request is taking longer than expected. Please retry.'));},10000);
    } else {
      state.loading=false; clearTimeout(loadingTimer); node.hidden = true;
      content.hidden = false;
    }
  }

  function showError(error) { state.loading=false; clearTimeout(loadingTimer);
    const node = document.getElementById('state');
    if (!node) return;
    node.hidden = false;
    node.className = 'state-error';
    node.innerHTML = `<strong>We could not load this dashboard.</strong><p>${esc(error?.message || 'Please try again.')}</p><button type="button" class="btn-small primary" data-action="refresh">Try again</button>`;
    document.getElementById('content').hidden = true;
  }

  function metric(icon, label, value, foot, action) {
    return `<div class="metric-card"><div class="metric-icon" aria-hidden="true">${icon}</div><div class="metric-body"><div class="metric-label">${esc(label)}</div><div class="metric-value">${Number(value || 0).toLocaleString()}</div><div class="metric-foot">${esc(foot || '')}</div></div></div>`;
  }

  function actionCard(href, icon, title, help) {
    return `<a class="action-card" href="${esc(href)}"><div class="action-icon" aria-hidden="true">${icon}</div><div class="action-body"><div class="action-title">${esc(title)}</div><div class="action-help">${esc(help)}</div></div></a>`;
  }

  function empty(title, text) { return `<div class="empty-state"><strong>${esc(title)}</strong><span>${esc(text)}</span></div>`; }

  function requestTracker(r){const stages=['REQUESTED','ASSIGNED','ACCEPTED','IN_PROGRESS','COMPLETED'];const current=Math.max(0,stages.indexOf(r.status));return `<div class="request-tracker"><div class="request-tracker-head"><div><strong>${esc(r.status.replace('_',' '))}</strong>${r.doctorName?`<span class="small-muted"> · Dr. ${esc(r.doctorName)}</span>`:''}</div><span class="badge-soft ${r.priority==='URGENT'?'badge-emergency':r.priority==='HIGH'?'badge-high':'badge-status'}">${esc(r.priority)}</span></div><div class="request-tracker-steps">${stages.map((stage,index)=>`<span class="request-tracker-step ${index<current?'is-complete':''} ${index===current?'is-active':''}">${esc(stage.replace('_',' '))}</span>`).join('')}</div><div class="list-meta"><span>${esc(fmtDate(r.createdAt))}</span><span>${esc((r.chiefComplaint||r.symptoms||'').slice(0,120))}</span></div></div>`; }

  function patientVitals(v) {
    if (!v) return empty('No vitals recorded yet', 'Your latest measurements will appear here when they are recorded.');
    return `<div class="vitals-strip">
      <div class="vital"><strong>${valueOrDash(v.spo2, '%')}</strong><span>SpO₂</span></div>
      <div class="vital"><strong>${v.systolicBp && v.diastolicBp ? `${esc(v.systolicBp)}/${esc(v.diastolicBp)}` : '—'}</strong><span>Blood pressure</span></div>
      <div class="vital"><strong>${valueOrDash(v.heartRate, ' bpm')}</strong><span>Heart rate</span></div>
      <div class="vital"><strong>${valueOrDash(v.temperature, ' °C')}</strong><span>Temperature</span></div>
    </div><p class="small-muted">Recorded ${esc(fmtDate(v.recordedAt))}</p>`;
  }

  function vitalsChart(history) {
    const data = (history || []).filter(v => v.spo2 !== null && v.spo2 !== undefined).slice(-8);
    if (data.length < 2) return empty('Not enough data for a trend', 'At least two SpO₂ readings are needed to show a trend.');
    const width = 700, height = 210, pad = 34;
    const vals = data.map(v => Number(v.spo2));
    const min = Math.min(80, Math.min(...vals) - 2), max = Math.max(100, Math.max(...vals) + 2);
    const x = i => pad + (i * (width - pad * 2) / (data.length - 1));
    const y = v => height - pad - ((v - min) / (max - min)) * (height - pad * 2);
    const points = data.map((v, i) => `${x(i)},${y(Number(v.spo2))}`).join(' ');
    const dots = data.map((v, i) => `<circle class="chart-dot" cx="${x(i)}" cy="${y(Number(v.spo2))}" r="4"><title>${esc(v.spo2)}% — ${esc(fmtDate(v.recordedAt))}</title></circle>`).join('');
    const labels = data.map((v, i) => `<text class="chart-label" x="${x(i)}" y="${height - 8}" text-anchor="middle">${esc(new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(v.recordedAt)))}</text>`).join('');
    return `<div class="chart-wrap"><svg class="vitals-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="SpO₂ trend"><line class="chart-axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height-pad}"/><line class="chart-axis" x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}"/><polyline class="chart-line" points="${points}"/>${dots}${labels}<text class="chart-label" x="8" y="${y(max)+4}">100</text><text class="chart-label" x="8" y="${y(min)+4}">${esc(min)}</text></svg></div>`;
  }

  function specialistList(items){return empty('Doctor selection is handled by the care team','Submit a consultation request and an administrator will assign an approved doctor.');}

  function patientView(d, u) {
    const p = d.profile;
    const v = d.latestVitals;
    const next = d.upcomingAppointments?.[0];
    return `<div class="dashboard-shell">
      ${hero(u, 'PATIENT')}
      <div class="dashboard-grid">
        <div class="span-12"><div class="metrics-row">${metric('📅','Appointments',d.stats?.appointments,'All appointments in your record','appointments')}${metric('💬','Consultations',d.stats?.consultations,'All consultation records','consultations')}${metric('📄','Prescriptions',d.stats?.prescriptions,'Issued prescription records','prescriptions')}${metric('🩺','Vitals',d.stats?.vitals,'Recorded measurements','vitals')}</div></div>
        <div class="span-12 dashboard-card card-pad"><div class="section-head"><div><h2>Consultation requests</h2><p>The care team assigns the appropriate approved doctor for you.</p></div><a class="section-action" href="consultation.html">Request care</a></div>${state.patientRequests.length?state.patientRequests.slice(0,5).map(r=>`${requestTracker(r)}${r.appointmentId?`<div class="list-actions request-tracker-action"><a class="btn-small primary" href="consultation.html?patientId=${encodeURIComponent(r.patientId)}&appointmentId=${encodeURIComponent(r.appointmentId)}&mode=workspace">${r.status==='IN_PROGRESS'?'Join consultation':r.status==='COMPLETED'?'View notes':'Open'}</a></div>`:''}`).join(''):empty('No consultation requests','Submit a consultation request and the admin care team will assign a doctor.')}</div>
        <div class="span-12"><div class="action-grid">${actionCard('consultation.html','💬','Request consultation','Submit symptoms; admin assigns the doctor')}${actionCard('consultation.html','💬','Consultations','Open your consultation history')}${actionCard('prescription.html','📄','Prescriptions','View issued prescriptions')}${actionCard('emergency.html','🚨','Emergency help','Get urgent assistance')}</div></div>
        <div class="span-8 dashboard-card card-pad"><div class="section-head"><div><h2>Next appointment</h2><p>Your next scheduled care interaction.</p></div><a class="section-action" href="appointments.html">View all</a></div>${next ? appointmentRow(next, true) : empty('No upcoming appointment', 'When a visit is scheduled, it will appear here.')}</div>
        <div class="span-4 dashboard-card card-pad"><div class="section-head"><div><h2>Latest vitals</h2><p>Your most recent measurements.</p></div><a class="section-action" href="patient-profile.html">History</a></div>${patientVitals(v)}</div>
        <div class="span-7 dashboard-card card-pad"><div class="section-head"><div><h2>Health trend</h2><p>Recent SpO₂ readings from your record.</p></div></div>${vitalsChart(d.vitalsHistory)}</div>
        <div class="span-5 dashboard-card card-pad"><div class="section-head"><div><h2>Profile</h2><p>Information currently linked to your account.</p></div><a class="section-action" href="patient-profile.html">Open</a></div><div class="profile-summary"><div class="profile-avatar">${esc(initials(p?.name || u.name))}</div><div><div class="profile-name">${esc(p?.name || u.name || 'Patient')}</div><div class="profile-meta">${esc(p?.patientCode || 'Patient code pending')} · ${esc(p?.village || 'Village not specified')}</div></div></div><div class="detail-grid" style="margin-top:14px">${detail('Age',p?.age)}${detail('Gender',p?.gender)}${detail('Mobile',p?.mobile || u.mobile)}${detail('Blood group',p?.bloodGroup)}</div></div>
        <div class="span-6 dashboard-card card-pad"><div class="section-head"><div><h2>Recent consultations</h2><p>Latest clinical interactions.</p></div><a class="section-action" href="consultation.html">Open</a></div>${consultationList(d.recentConsultations)}</div>
        <div class="span-6 dashboard-card card-pad"><div class="section-head"><div><h2>Recent prescriptions</h2><p>Documents issued by your care team.</p></div><a class="section-action" href="prescription.html">Open</a></div>${prescriptionList(d.recentPrescriptions)}</div>
      </div>
    </div>`;
  }

  function ashaView(d, u) {
    const patients = filterItems(d.patients || [], state.patientFilter, state.search);
    return `<div class="dashboard-shell">
      ${hero(u,'ASHA')}
      <div class="dashboard-grid">
        <div class="span-12"><div class="action-grid">${actionCard('patient-register.html','➕','Register patient','Create a patient record')}${actionCard('consultation.html','💬','Consultations','Assist assigned consultations')}${actionCard('sync.html','↻','Sync center','Review queued operations')}${actionCard('emergency.html','🚨','Emergency help','Escalate urgent situations')}</div></div>
        <div class="span-12"><div class="metrics-row">${metric('👥','Patients in scope',d.stats?.patients,'Assigned health-center population','patients')}${metric('📅','Today’s visits',d.stats?.today,'Appointments scheduled today','appointments')}${metric('📋','All appointments',d.stats?.appointments,'Assigned appointment history','appointments')}${metric('⚠️','Sync issues',d.stats?.syncIssues,'Failed or conflicted operations','sync')}</div></div>
        <div class="span-8 dashboard-card card-pad"><div class="section-head"><div><h2>Priority patient list</h2><p>Patients are ordered by latest triage risk and recent activity.</p></div></div><div class="toolbar"><div class="search-wrap"><input class="search-input" id="asha-search" type="search" placeholder="Search patient name, code or village" value="${esc(state.search)}" aria-label="Search patients"></div></div><div class="priority-filter" style="margin:12px 0 4px">${['ALL','EMERGENCY','HIGH','MODERATE','LOW'].map(x=>`<button type="button" class="filter-btn ${state.patientFilter===x?'active':''}" data-action="asha-filter" data-filter="${x}">${x==='ALL'?'All':x}</button>`).join('')}</div><div class="list" id="asha-patients">${patients.length ? patients.slice(0,12).map(ashaPatientRow).join('') : empty('No patients match your filter','Try another search or risk level.')}</div></div>
        <div class="span-4 dashboard-card card-pad"><div class="section-head"><div><h2>Today</h2><p>Assigned field and teleconsultation work.</p></div><a class="section-action" href="appointments.html">All</a></div>${(d.todayAppointments||[]).length ? d.todayAppointments.map(x=>appointmentRow(x,false)).join('') : empty('No visits today','Your schedule is clear.')}</div>
        <div class="span-6 dashboard-card card-pad"><div class="section-head"><div><h2>Synchronization</h2><p>Current state of your operations.</p></div><a class="section-action" href="sync.html">Open</a></div>${syncProgress(d.sync)}</div>
        <div class="span-6 dashboard-card card-pad"><div class="section-head"><div><h2>Field guidance</h2><p>Keep patient care moving even when connectivity changes.</p></div></div><div class="detail-grid">${detail('Connection',navigator.onLine?'Online':'Offline')}${detail('Health center',u.healthCenterId?'Assigned':'Not assigned')}${detail('Offline records',d.sync?.total)}${detail('Sync conflicts',d.sync?.conflicts)}</div></div>
      </div>
    </div>`;
  }

  function doctorView(d, u) {
    const queue = filterItems(d.queue || [], state.queueFilter, '');
    return `<div class="dashboard-shell">
      ${hero(u,'DOCTOR')}
      <div class="dashboard-grid">
        <div class="span-12"><div class="action-grid">${actionCard('appointments.html','📅','Appointments','Review today’s schedule')}${actionCard('consultation.html','💬','Consultations','Open active clinical work')}${actionCard('prescription.html','📄','Prescriptions','Issue and review prescriptions')}${actionCard('emergency.html','🚨','Emergency help','Escalation resources')}</div></div>
        <div class="span-12"><div class="metrics-row">${metric('🩺','Today’s queue',d.stats?.today,'Scheduled, waiting or in progress','queue')}${metric('⏳','Waiting now',d.stats?.waiting,'Patients ready for attention','queue-waiting')}${metric('💬','Consultations',d.stats?.consultations,'Total assigned consultations','consultations')}${metric('📄','Prescriptions',d.stats?.prescriptions,'Issued prescriptions','prescriptions')}</div></div>
        <div class="span-8 dashboard-card card-pad"><div class="section-head"><div><h2>Clinical queue</h2><p>Priority is based on the latest available triage result; clinical judgement remains authoritative.</p></div><a class="section-action" href="consultation.html">Open consultations</a></div><div class="priority-filter" style="margin-bottom:12px">${['ALL','EMERGENCY','HIGH','MODERATE','LOW'].map(x=>`<button type="button" class="filter-btn ${state.queueFilter===x?'active':''}" data-action="doctor-filter" data-filter="${x}">${x==='ALL'?'All':x}</button>`).join('')}</div><div class="list">${queue.length ? queue.map(doctorQueueRow).join('') : empty('No patients in today’s queue','New assigned appointments will appear here.')}</div></div>
        <div class="span-4 dashboard-card card-pad"><div class="section-head"><div><h2>Doctor profile</h2><p>Current professional account.</p></div></div><div class="profile-summary"><div class="profile-avatar">${esc(initials(u.name))}</div><div><div class="profile-name">${esc(u.name || 'Doctor')}</div><div class="profile-meta">${esc(u.email || u.mobile || '')}</div></div></div><div class="detail-grid" style="margin-top:14px">${detail('Role',u.role)}${detail('Status',u.accountStatus)}${detail('Health center',u.healthCenterId?'Assigned':'Not assigned')}${detail('Specialization',d.verification?.specialization||'Not provided')}${detail('Qualification',d.verification?.qualification||'Not provided')}${detail('Experience',d.verification?.experienceYears!=null?`${d.verification.experienceYears} years`:'Not provided')}${detail('Mobile',u.mobile)}</div></div>
        <div class="span-12 dashboard-card card-pad"><div class="section-head"><div><h2>Verification status</h2><p>Administrative review of your professional credentials.</p></div></div>${verificationView(d.verification)}</div>
        <div class="span-12 dashboard-card card-pad"><div class="section-head"><div><h2>Recent consultations</h2><p>Latest completed and active clinical records.</p></div><a class="section-action" href="consultation.html">View all</a></div>${doctorRecentList(d.recentConsultations)}</div>
      </div>
    </div>`;
  }

  function consultationRequestRow(x){return `<div class="approval-card"><div class="approval-head"><div><div class="approval-title">${esc(x.patientName||'Patient')}</div><div class="approval-meta">${esc(x.patientCode||'Patient')} · ${esc(x.priority)} · ${esc(x.status)}</div></div><span class="badge-soft badge-status">${esc(x.status)}</span></div><div class="small-muted" style="margin:8px 0">${esc(x.symptoms)}</div><div class="list-actions">${x.doctorName?`<span class="small-muted">Assigned to Dr. ${esc(x.doctorName)}</span>`:`<button type="button" class="btn-small primary" data-action="assign-consultation" data-request-id="${esc(x.id)}">Assign doctor</button>`}</div></div>`;}

  function doctorDirectory(doctors){return doctors?.length?`<div class="doctor-directory">${doctors.map(d=>`<div class="doctor-directory-row"><div class="doctor-directory-avatar">${esc(initials(d.name||'Doctor'))}</div><div class="doctor-directory-main"><strong>Dr. ${esc(d.name||'Doctor')}</strong><span>${esc(d.specialization||'General Medicine')}${d.qualification?` · ${esc(d.qualification)}`:''}</span><small>${esc(d.mobile||d.email||'Contact not available')}</small></div><span class="presence ${String(d.presence||'OFFLINE').toLowerCase()}"><span class="presence-dot ${String(d.presence||'OFFLINE').toLowerCase()}"></span>${esc(d.presence||'OFFLINE')}</span></div>`).join('')}</div>`:empty('No active doctors','Approved doctors will appear here when available.');}

  function adminView(d,u) {
    const a=state.admin,pg=a.pagination||{};
    return `<div class="dashboard-shell">
      ${hero(u,'ADMIN')}
      <div class="dashboard-grid">
        <div class="span-12"><div class="action-grid">${actionCard('patient-profile.html','👥','Patient directory','Search operational patient records')}${actionCard('appointments.html','📅','Appointments','Monitor scheduled care')}${actionCard('admin-create.html','➕','Create administrator','Add a trusted platform administrator')}${actionCard('emergency.html','🚨','Emergency resources','Operational escalation')}</div></div>
        <div class="span-12"><div class="metrics-row">${metric('👥','Active patients',d.stats?.patients,'Patient accounts')}${metric('🩺','Active doctors',d.stats?.doctors,'Verified doctor accounts')}${metric('🏘️','Active ASHA',d.stats?.asha,'Provisioned field workers')}${metric('⚠️','Pending verification',Number(d.stats?.pendingDoctors||0)+Number(d.stats?.pendingAsha||0),'Applications awaiting review')}${metric('💬','Consultation requests',d.stats?.pendingConsultationRequests,'Patients waiting for doctor assignment')}</div></div>
        <div class="span-12 dashboard-card card-pad"><div class="section-head"><div><h2>Consultation requests</h2><p>Patients never choose doctors. Review requests and assign an approved doctor.</p></div><button type="button" class="btn-small" data-action="refresh-consultation-requests">Refresh</button></div><div class="list">${a.requests.length?a.requests.map(consultationRequestRow).join(''):empty('No consultation requests','New patient requests will appear here.')}</div></div>
        <div id="doctor-directory" class="span-12 dashboard-card card-pad"><div class="section-head"><div><h2>Doctor directory</h2><p>Approved doctors and their current availability.</p></div><span class="dashboard-status"><span class="dot"></span><span>${a.doctors.filter(x=>x.presence==='ONLINE').length} online</span></span></div>${doctorDirectory(a.doctors)}</div>
        <div class="span-12 dashboard-card card-pad"><div class="section-head"><div><h2>Professional verification queue</h2><p>Review credentials before activating access. Documents are private and audit logged.</p></div><button type="button" class="btn-small" data-action="verification-history">History</button></div>
          <div class="toolbar admin-toolbar"><input class="search-input" id="admin-verification-search" type="search" placeholder="Search name, mobile, email, specialization or license" value="${esc(a.search)}" aria-label="Search verification applications"><select id="admin-verification-role" class="search-input admin-select" aria-label="Filter role"><option value="ALL" ${a.role==='ALL'?'selected':''}>All roles</option><option value="DOCTOR" ${a.role==='DOCTOR'?'selected':''}>Doctors</option><option value="ASHA" ${a.role==='ASHA'?'selected':''}>ASHA</option></select><select id="admin-verification-status" class="search-input admin-select" aria-label="Filter status"><option value="ALL" ${a.status==='ALL'?'selected':''}>All status</option><option value="PENDING" ${a.status==='PENDING'?'selected':''}>Pending</option><option value="UNDER_REVIEW" ${a.status==='UNDER_REVIEW'?'selected':''}>Under review</option><option value="APPROVED" ${a.status==='APPROVED'?'selected':''}>Approved</option><option value="REJECTED" ${a.status==='REJECTED'?'selected':''}>Rejected</option></select><select id="admin-verification-sort" class="search-input admin-select" aria-label="Sort"><option value="created_at" ${a.sort==='created_at'?'selected':''}>Newest</option><option value="name" ${a.sort==='name'?'selected':''}>Name</option><option value="status" ${a.sort==='status'?'selected':''}>Status</option></select><button type="button" class="btn-small primary" data-action="verification-filter">Apply</button></div>
          <div class="list">${a.items.length?a.items.map(adminVerificationRow).join(''):empty('No applications found','No professional applications match the current filters.')}</div>
          <div class="pagination-bar"><span>${pg.total?`Showing page ${pg.page} of ${pg.totalPages} · ${pg.total} applications`:'No applications'}</span><div><button type="button" class="btn-small" data-action="verification-page" data-page="${Math.max(1,(pg.page||1)-1)}" ${!pg.page||pg.page<=1?'disabled':''}>Previous</button><button type="button" class="btn-small" data-action="verification-page" data-page="${Math.min(pg.totalPages||1,(pg.page||1)+1)}" ${!pg.totalPages||pg.page>=pg.totalPages?'disabled':''}>Next</button></div></div>
        </div>
        <div class="span-7 dashboard-card card-pad"><div class="section-head"><div><h2>Today’s operations</h2><p>Live totals from the central database.</p></div></div><div class="detail-grid">${detail('Appointments today',d.stats?.todayAppointments)}${detail('Consultations today',d.stats?.todayConsultations)}${detail('Doctor approvals',d.stats?.pendingDoctors)}${detail('ASHA approvals',d.stats?.pendingAsha)}</div></div>
        <div class="span-5 dashboard-card card-pad"><div class="section-head"><div><h2>Recent audit activity</h2><p>Security and operational events.</p></div><button type="button" class="btn-small" data-action="audit-history">View all</button></div>${auditList(d.audit)}</div>
      </div>
    </div>`;
  }
  function adminVerificationRow(x){const role=x.role==='DOCTOR'?'Doctor':'ASHA field worker';const pending=['PENDING','UNDER_REVIEW'].includes(x.status);return `<div class="approval-card"><div class="approval-head"><div><div class="approval-title">${esc(x.name)}</div><div class="approval-meta">${role} · ${esc(x.mobile||x.email||'No contact')}</div></div>${statusBadge(x.status)}</div><div class="approval-meta">${x.specialization?`Specialization: ${esc(x.specialization)} · `:''}${x.qualification?`Qualification: ${esc(x.qualification)} · `:''}${x.licenseNumber?`License: ${esc(x.licenseNumber)}`:''}</div><div class="approval-actions">${x.role==='DOCTOR'?`<button type="button" class="btn-small" data-action="doctor-documents" data-application-id="${esc(x.applicationId)}" data-doctor-name="${esc(x.name)}">View documents</button>`:''}${pending?`<button type="button" class="btn-small primary" data-action="approve" data-user-id="${esc(x.userId)}">Approve</button><button type="button" class="btn-small danger" data-action="reject" data-user-id="${esc(x.userId)}">Reject</button>`:''}${x.reviewNotes?`<button type="button" class="btn-small" data-action="review-note" data-note="${esc(x.reviewNotes)}">Review note</button>`:''}</div></div>`;}
  function hero(u, role) {
    const m=roleMeta[role]||roleMeta.PATIENT;
    return `<header class="dashboard-hero"><div><p class="dashboard-eyebrow">${esc(m.eyebrow)}</p><h1 class="dashboard-title">${esc(m.title)}</h1><p class="dashboard-subtitle">${esc(m.subtitle)} <strong>Welcome, ${esc(u.name || u.email || u.mobile || 'User')}.</strong></p><p class="small-muted" id="dashboard-last-updated">Updated just now</p></div><div class="hero-actions"><span class="dashboard-status" id="dash-network-status"><span class="dot"></span><span>${navigator.onLine?'Online':'Offline'}</span></span><button type="button" class="icon-action" data-action="notifications" aria-label="Open notifications" title="Notifications">🔔</button><button type="button" class="icon-action" data-action="profile" aria-label="Open profile" title="Profile">👤</button><button type="button" class="icon-action" data-action="refresh" aria-label="Refresh dashboard" title="Refresh">↻</button></div></header>`;
  }

  function detail(label,value){return `<div class="detail-item"><small>${esc(label)}</small><strong>${valueOrDash(value)}</strong></div>`;}

  function appointmentRow(a, prominent){return `<div class="list-row"><div class="list-main"><div class="list-title">${esc(a.patientName || a.doctorName || 'Appointment')}</div><div class="list-meta"><span>${esc(fmtDate(a.scheduledAt))}</span><span>${esc(a.consultationType || 'VIDEO')}</span></div></div><div class="list-actions">${statusBadge(a.status)}${prominent?`<a class="btn-small primary" href="appointments.html">Open</a>`:''}</div></div>`;}

  function consultationList(items){return items?.length?`<div class="list">${items.map(c=>`<div class="list-row"><div class="list-main"><div class="list-title">${esc(c.doctorName || 'Care team')}</div><div class="list-meta"><span>${esc(fmtDate(c.createdAt,false))}</span><span>${esc(c.assessment || c.symptoms || 'Consultation record')}</span></div></div><div class="list-actions">${statusBadge(c.status)}</div></div>`).join('')}</div>`:empty('No consultations yet','Your consultation history will appear here.');}

  function prescriptionList(items){return items?.length?`<div class="list">${items.map(p=>`<div class="list-row"><div class="list-main"><div class="list-title">${esc(p.assessment || 'Prescription')}</div><div class="list-meta"><span>${esc(p.doctorName || 'Doctor')}</span><span>${esc(fmtDate(p.createdAt,false))}</span><span>${esc(p.itemCount)} medicines</span></div></div><div class="list-actions"><a class="btn-small" href="prescription.html">Open</a></div></div>`).join('')}</div>`:empty('No prescriptions yet','Issued prescriptions will appear here.');}

  function ashaPatientRow(p){const r=p.triage?.riskLevel;return `<div class="list-row"><div class="list-main"><div class="list-title">${esc(p.name)} <span class="small-muted">${esc(p.patientCode)}</span></div><div class="list-meta"><span>${esc(p.village || 'Village not specified')}</span><span>${esc(p.age)} yrs</span><span>SpO₂ ${valueOrDash(p.vitals?.spo2,'%')}</span></div></div><div class="list-actions">${r?`<span class="${riskClass(r)}">${esc(riskLabel(r))}</span>`:statusBadge(p.syncStatus)}<button type="button" class="btn-small" data-action="patient-details" data-patient-id="${esc(p.id)}" data-patient-name="${esc(p.name)}">View</button></div></div>`;}

  function doctorQueueRow(p){const r=p.triage?.riskLevel;const label=p.status==='SCHEDULED'?'Review':p.status==='WAITING'?'Start':'Open';const response=p.status==='SCHEDULED'&&p.requestId?`<button type="button" class="btn-small primary" data-action="doctor-accept" data-request-id="${esc(p.requestId)}">Accept</button><button type="button" class="btn-small danger" data-action="doctor-decline" data-request-id="${esc(p.requestId)}">Decline</button>`:'';return `<div class="list-row queue-row"><div class="list-main"><div class="list-title">${esc(p.patientName)} <span class="small-muted">${esc(p.patientCode)}</span></div><div class="list-meta"><span>${esc(fmtDate(p.scheduledAt))}</span><span>${esc(p.age)} yrs · ${esc(p.gender)}</span><span>SpO₂ ${valueOrDash(p.vitals?.spo2,'%')}</span></div></div><div class="list-actions">${r?`<span class="${riskClass(r)}">${esc(riskLabel(r))}</span>`:statusBadge(p.status)}${response}<a class="btn-small primary" href="consultation.html?patientId=${encodeURIComponent(p.patientId)}&appointmentId=${encodeURIComponent(p.id)}&mode=workspace">${label}</a></div></div>`;}

  function verificationView(v){if(!v)return empty('Verification record unavailable','Your application record could not be found.');const s=String(v.status||'PENDING');const cls=s==='APPROVED'?'badge-low':s==='REJECTED'?'badge-high':'badge-moderate';return `<div class="verification-panel"><span class="badge-soft ${cls}">${esc(s.replace('_',' '))}</span><p class="small-muted">${s==='APPROVED'?'Your professional account has been approved.':s==='REJECTED'?'Your application needs attention. Please review the administrator reason below.':'Your documents are being reviewed by an administrator.'}</p>${v.reviewNotes?`<div class="detail-item"><small>Administrator note</small><strong>${esc(v.reviewNotes)}</strong></div>`:''}</div>`;}

  function doctorRecentList(items){return items?.length?`<div class="list">${items.map(c=>`<div class="list-row"><div class="list-main"><div class="list-title">${esc(c.patientName)} <span class="small-muted">${esc(c.patientCode)}</span></div><div class="list-meta"><span>${esc(fmtDate(c.createdAt))}</span><span>${esc(c.status)}</span><span>${esc(c.assessment || 'No assessment recorded')}</span></div></div><div class="list-actions"><a class="btn-small" href="consultation.html">Open</a></div></div>`).join('')}</div>`:empty('No consultation history','Completed and active consultations will appear here.');}

  function syncProgress(s){const total=Math.max(1,Number(s?.total||0));return `<div class="progress-list">${progress('Synced',s?.synced,total)}${progress('Failed',s?.failed,total)}${progress('Conflicts',s?.conflicts,total)}</div><p class="small-muted" style="margin-top:14px">${esc(s?.total||0)} total operations recorded for your account.</p>`;}
  function progress(label,value,total){const v=Number(value||0),t=Math.max(1,Number(total||0));return `<div class="progress-item"><div class="progress-label"><span>${esc(label)}</span><span>${v.toLocaleString()}</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100,Math.round(v/t*100))}%"></div></div></div>`;}

  function approvalList(d){const doctors=d.pendingDoctorApplications||[],asha=d.pendingAshaApplications||[];if(!doctors.length&&!asha.length)return empty('No approvals waiting','All professional applications are currently up to date.');return `<div>${doctors.map(x=>`<div class="approval-card"><div class="approval-head"><div><div class="approval-title">${esc(x.fullName)}</div><div class="approval-meta">Doctor · ${esc(x.qualification)} · ${esc(x.specialization)} · ${esc(x.experienceYears)} yrs</div></div>${statusBadge(x.status)}</div><div class="approval-meta">License: ${esc(x.licenseNumber)} · ${esc(x.mobile || x.email || '')}</div><div class="approval-actions"><button type="button" class="btn-small" data-action="doctor-documents" data-application-id="${esc(x.id)}" data-doctor-name="${esc(x.fullName)}">View documents</button><button type="button" class="btn-small primary" data-action="approve" data-user-id="${esc(x.userId)}">Approve doctor</button><button type="button" class="btn-small danger" data-action="reject" data-user-id="${esc(x.userId)}">Reject</button></div></div>`).join('')}${asha.map(x=>`<div class="approval-card"><div class="approval-head"><div><div class="approval-title">${esc(x.name)}</div><div class="approval-meta">ASHA field worker · ${esc(x.mobile || x.email || '')}</div></div>${statusBadge(x.status)}</div><div class="approval-actions"><button type="button" class="btn-small primary" data-action="approve" data-user-id="${esc(x.userId)}">Approve ASHA</button><button type="button" class="btn-small danger" data-action="reject" data-user-id="${esc(x.userId)}">Reject</button></div></div>`).join('')}</div>`;}

  function userTable(users){if(!users?.length)return empty('No users found','New accounts will appear here.');return `<div class="table-scroll"><table class="dashboard-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Created</th></tr></thead><tbody>${users.map(x=>`<tr><td><strong>${esc(x.name)}</strong><br><span class="small-muted">${esc(x.mobile || x.email || '')}</span></td><td>${esc(x.role)}</td><td>${statusBadge(x.accountStatus)}</td><td>${esc(fmtDate(x.createdAt,false))}</td></tr>`).join('')}</tbody></table></div>`;}
  function auditList(items){return items?.length?items.map(x=>`<div class="audit-item"><div class="audit-action">${esc(x.action)}</div><div class="audit-meta">${esc(x.resourceType)} · ${esc(fmtDate(x.createdAt))}</div></div>`).join(''):empty('No audit activity','Recent operational events will appear here.');}

  function filterItems(items, filter, search){return (items||[]).filter(x=>{const risk=x.triage?.riskLevel||'LOW';const f=filter==='ALL'||risk===filter;const q=String(search||'').toLowerCase().trim();const text=[x.name,x.patientName,x.patientCode,x.village].filter(Boolean).join(' ').toLowerCase();return f&&(!q||text.includes(q));});}

  function render(){
    const d=state.data,u=auth.getCurrentUser();
    if(!d||!u)return;
    const content=document.getElementById('content');
    if(!content) throw new Error('Dashboard content container is missing.');
    content.innerHTML=ROLE==='PATIENT'?patientView(d,u):ROLE==='ASHA'?ashaView(d,u):ROLE==='DOCTOR'?doctorView(d,u):adminView(d,u);
    if(ROLE==='ADMIN'&&location.hash==='#doctor-directory')requestAnimationFrame(()=>document.getElementById('doctor-directory')?.scrollIntoView({behavior:'smooth',block:'start'}));
    setLoading(false);
    updateNetworkStatus();
    const stamp=document.getElementById('dashboard-last-updated'); if(stamp) stamp.textContent=`Updated ${new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date())}`;
  }

  async function load(){
    setLoading(true,'Loading your dashboard');
    try { state.data=await api.getDashboard(); if(ROLE==='PATIENT'){try{state.patientRequests=await api.getMyConsultationRequests();}catch(e){state.patientRequests=[];}} if(ROLE==='ADMIN'){ await Promise.all([loadAdminVerification(),loadAdminConsultationRequests()]); } render(); }
    catch(e){ console.error('[Nabha Dashboard] load/render failed:', e); showError(e); }
  }

  async function refreshLiveData(){
    if(state.loading || document.visibilityState !== 'visible')return;
    try {
      state.data=await api.getDashboard();
      if(ROLE==='PATIENT'){
        try{state.patientRequests=await api.getMyConsultationRequests();}catch(e){}
      }
      if(ROLE==='ADMIN')await Promise.all([loadAdminVerification(),loadAdminConsultationRequests()]);
      render();
    } catch(e) {}
  }

  async function loadAdminVerification(){ if(ROLE!=='ADMIN')return; try{const result=await api.adminVerification({page:state.admin.page,limit:8,search:state.admin.search,status:state.admin.status==='ALL'?'':state.admin.status,role:state.admin.role==='ALL'?'':state.admin.role,sort:state.admin.sort,order:state.admin.order});state.admin.pagination=result.pagination;state.admin.items=result.data||[];}catch(e){state.admin.items=[];state.admin.pagination=null;ui.showToast(e.message||'Unable to load verification queue','danger');} }


  async function loadAdminConsultationRequests(){if(ROLE!=='ADMIN')return;try{const [r,doctors]=await Promise.all([api.getAdminConsultationRequests({status:state.admin.requestStatus,page:1,limit:20}),api.getAdminConsultationDoctors()]);state.admin.requests=r||[];state.admin.doctors=doctors||[];}catch(e){state.admin.requests=[];state.admin.doctors=[];ui.showToast(e.message||'Unable to load consultation data','danger');}}
  async function assignConsultation(id){try{const doctors=await api.getAdminConsultationDoctors();if(!doctors?.length){ui.showToast('No approved active doctors are available for assignment.','warning');return;}const request=state.admin.requests.find(x=>x.id===id)||{};overlay(`<section class="assignment-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><span class="dashboard-eyebrow">Care team routing</span><h2>Assign a doctor</h2><p>Select an approved doctor for this request.</p></div><button type="button" class="close-btn" data-close-overlay aria-label="Close">✕</button></div><div class="assignment-layout"><div class="assignment-patient"><span class="modal-kicker">PATIENT REQUEST</span><h3>${esc(request.patientName||'Patient')}</h3><div class="assignment-priority ${String(request.priority||'NORMAL').toLowerCase()}">${esc(request.priority||'NORMAL')} priority</div><p>${esc(request.chiefComplaint||request.symptoms||'No symptoms provided.')}</p><div class="detail-grid">${detail('Age',request.patientAge||'Not recorded')}${detail('Risk',request.triageRisk||'Not assessed')}</div></div><div class="assignment-doctors"><span class="modal-kicker">AVAILABLE DOCTORS</span>${doctors.map(d=>`<button type="button" class="doctor-choice" data-action="assign-doctor-from-modal" data-request-id="${esc(id)}" data-doctor-id="${esc(d.id)}"><span class="presence-dot ${String(d.presence||'OFFLINE').toLowerCase()}"></span><span class="doctor-choice-copy"><strong>Dr. ${esc(d.name)}</strong><small>${esc(d.specialization||'General Medicine')}</small></span><span class="doctor-presence">${esc(d.presence||'OFFLINE')}</span></button>`).join('')}</div></div></section>`);}catch(e){ui.showToast(e.message||'Unable to load doctors','danger');}}

  async function assignDoctorFromModal(el){el.disabled=true;try{await api.assignConsultationDoctor(el.dataset.requestId,el.dataset.doctorId);document.querySelector('.modal-backdrop')?.remove();ui.showToast('Doctor assigned. Patient and doctor have been notified.','success');await load();}catch(e){el.disabled=false;ui.showToast(e.message||'Unable to assign doctor','danger');}}

  async function respondToRequest(id,action){try{if(action==='accept'){await api.acceptConsultationRequest(id);ui.showToast('Patient accepted. You can start the consultation when ready.','success');}else{const reason=window.prompt('Reason for declining this assignment (optional):','');if(reason===null)return;await api.request('POST',`/consultation-requests/${encodeURIComponent(id)}/decline`,{reason});ui.showToast('Assignment declined and sent to the admin care team.','success');}await load();}catch(e){ui.showToast(e.message||'Unable to update the request','danger');}}

  async function loadNotifications(){
    try { state.notifications=await api.getNotifications(); } catch(e){ state.notifications=[]; }
  }

  function overlay(html, className='modal-backdrop'){
    const node=document.createElement('div');node.className=className;node.innerHTML=html;document.body.appendChild(node);node.addEventListener('click',e=>{if(e.target===node||e.target.closest('[data-close-overlay]'))node.remove();});return node;
  }

  function profileModal(){const u=auth.getCurrentUser()||{};overlay(`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div class="modal-head"><div><h2 id="profile-title">Account profile</h2><p>Your authenticated account information.</p></div><button type="button" class="close-btn" data-close-overlay aria-label="Close">✕</button></div><div class="profile-summary"><div class="profile-avatar">${esc(initials(u.name))}</div><div><div class="profile-name">${esc(u.name||'User')}</div><div class="profile-meta">${esc(u.role)} · ${esc(u.accountStatus||'ACTIVE')}</div></div></div><div class="detail-grid" style="margin-top:18px">${detail('Mobile',u.mobile)}${detail('Email',u.email)}${detail('Health center',u.healthCenterId||'Not assigned')}${detail('Organization',u.organizationId||'Not assigned')}</div><div style="display:flex;gap:8px;margin-top:18px"><button type="button" class="btn-small primary" data-close-overlay>Close</button><button type="button" class="btn-small danger" data-action="logout">Logout</button></div></section>`);}

  async function notificationsModal(){
    await loadNotifications();
    const unread=state.notifications.filter(x=>!x.read_at);
    overlay(`<section class="drawer" role="dialog" aria-modal="true" aria-labelledby="notifications-title"><div class="drawer-head"><div><h2 id="notifications-title">Notifications</h2><p>${unread.length} unread notification${unread.length===1?'':'s'}.</p></div><button type="button" class="close-btn" data-close-overlay aria-label="Close">✕</button></div>${state.notifications.length?state.notifications.map(n=>`<div class="notification-item ${n.read_at?'':'unread'}"><div class="notification-title">${esc(n.title)}</div><div class="notification-message">${esc(n.message)}</div><div class="notification-time">${esc(fmtDate(n.created_at))}</div>${n.read_at?'':`<button type="button" class="btn-small" style="margin-top:8px" data-action="read-notification" data-notification-id="${esc(n.id)}">Mark read</button>`}</div>`).join(''):empty('No notifications','You are all caught up.')}</section>`,'drawer-backdrop');
  }

  async function doctorDocuments(applicationId,name){try{const docs=await api.getDoctorDocuments(applicationId);const links=docs?.length?docs.map(d=>`<div class="document-row"><div><strong>${esc(d.documentType.replace('_',' '))}</strong><div class="small-muted">${esc(d.originalName)} · ${(Number(d.fileSizeBytes)/1024/1024).toFixed(2)} MB</div></div><button type="button" class="btn-small primary" data-action="open-doctor-document" data-application-id="${esc(applicationId)}" data-document-id="${esc(d.id)}">Open</button><button type="button" class="btn-small" data-action="download-doctor-document" data-application-id="${esc(applicationId)}" data-document-id="${esc(d.id)}">Download</button></div>`).join(''):empty('No documents uploaded','This application contains no verification files.');overlay(`<section class="drawer" role="dialog" aria-modal="true" aria-labelledby="doctor-docs-title"><div class="drawer-head"><div><h2 id="doctor-docs-title">${esc(name||'Doctor')} — documents</h2><p>Credential files submitted for administrative verification.</p></div><button type="button" class="close-btn" data-close-overlay aria-label="Close">✕</button></div><div class="drawer-section">${links}</div></section>`,'drawer-backdrop');}catch(e){ui.showToast(e.message||'Unable to load documents','danger');}}
  async function openDoctorDocument(applicationId,documentId){try{const blob=await api.downloadDoctorDocument(applicationId,documentId);const url=URL.createObjectURL(blob);const win=window.open(url,'_blank','noopener,noreferrer');if(!win)ui.showToast('Please allow pop-ups to view the document','warning');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){ui.showToast(e.message||'Unable to open document','danger');}}
  async function rejectUser(id){const notes=window.prompt('Enter the reason for rejecting this application:','');if(notes===null)return;if(!notes.trim()){ui.showToast('A rejection reason is required','warning');return;}try{await api.patch(`/admin/users/${encodeURIComponent(id)}/reject`,{notes:notes.trim()});ui.showToast('Application rejected and the applicant has been notified','success');await load();}catch(e){ui.showToast(e.message||'Rejection failed','danger');}}

  async function patientDetails(id,name){
    try {
      const p=await api.getPatient(id), [vitals,history]=await Promise.all([api.getVitals(id),api.getPatientHistory(id)]);
      overlay(`<section class="drawer" role="dialog" aria-modal="true" aria-labelledby="patient-detail-title"><div class="drawer-head"><div><h2 id="patient-detail-title">${esc(name||p.name)}</h2><p>${esc(p.patientCode||'Patient')} · ${esc(p.village||'Village not specified')}</p></div><button type="button" class="close-btn" data-close-overlay aria-label="Close">✕</button></div><div class="drawer-section"><h3>Patient details</h3><div class="detail-grid">${detail('Age',p.age)}${detail('Gender',p.gender)}${detail('Mobile',p.mobile)}${detail('Blood group',p.bloodGroup)}${detail('Allergies',p.allergies)}${detail('Existing conditions',p.existingConditions)}</div></div><div class="drawer-section"><h3>Latest vitals</h3>${patientVitals(vitals?.[0])}</div><div class="drawer-section"><h3>Medical history</h3>${history?.length?history.map(x=>`<div class="list-row"><div class="list-main"><div class="list-title">${esc(x.type||x.assessment||'Clinical record')}</div><div class="list-meta"><span>${esc(fmtDate(x.createdAt||x.recordedAt))}</span><span>${esc(x.notes||x.treatment||'')}</span></div></div></div>`).join(''):empty('No history available','No additional medical history is recorded.')}</div></section>`,'drawer-backdrop');
    } catch(e){ ui.showToast(e.message||'Unable to load patient details','danger'); }
  }

  async function doctorPatient(id,appointmentId){
    try { const p=await api.getPatient(id), history=await api.getPatientHistory(id), vitals=await api.getVitals(id); overlay(`<section class="drawer" role="dialog" aria-modal="true" aria-labelledby="doctor-patient-title"><div class="drawer-head"><div><h2 id="doctor-patient-title">${esc(p.name)}</h2><p>${esc(p.patientCode||'Patient')} · Appointment ${esc(appointmentId||'')}</p></div><button type="button" class="close-btn" data-close-overlay aria-label="Close">✕</button></div><div class="drawer-section"><h3>Clinical snapshot</h3><div class="detail-grid">${detail('Age',p.age)}${detail('Gender',p.gender)}${detail('Village',p.village)}${detail('Allergies',p.allergies)}${detail('Conditions',p.existingConditions)}${detail('History',p.medicalHistory)}</div></div><div class="drawer-section"><h3>Latest vitals</h3>${patientVitals(vitals?.[0])}</div><div class="drawer-section"><h3>Recent history</h3>${history?.length?history.slice(0,5).map(x=>`<div class="audit-item"><div class="audit-action">${esc(x.assessment||x.type||'Clinical record')}</div><div class="audit-meta">${esc(fmtDate(x.createdAt||x.recordedAt))} · ${esc(x.treatment||x.notes||'')}</div></div>`).join(''):empty('No previous history','No prior clinical history is available.')}</div><div style="display:flex;gap:8px;margin-top:20px"><a class="btn-small primary" href="consultation.html">Open consultation</a><a class="btn-small" href="patient-profile.html?patientId=${encodeURIComponent(id)}">Full record</a></div></section>`,'drawer-backdrop'); }
    catch(e){ ui.showToast(e.message||'Unable to load patient','danger'); }
  }

  function updateNetworkStatus(){const el=document.getElementById('dash-network-status');if(!el)return;el.classList.toggle('offline',!navigator.onLine);const s=el.querySelector('span:last-child');if(s)s.textContent=navigator.onLine?'Online':'Offline';}

  document.addEventListener('DOMContentLoaded', async () => {
    if(!auth.requireAuth([ROLE]))return;
    await i18n.init();
    ui.renderAppShell('dashboard');
    if (ROLE === 'DOCTOR') { try { await api.setDoctorPresence('ONLINE'); setInterval(() => api.setDoctorPresence(document.visibilityState === 'visible' ? 'ONLINE' : 'AWAY').catch(() => {}), 30000); } catch (e) {} }
    await Promise.all([loadNotifications(),load()]); setInterval(async()=>{await loadNotifications();},60000); setInterval(refreshLiveData,8000);
  });

  document.addEventListener('click', async (event) => {
    const el=event.target.closest('[data-action]'); if(!el)return;
    const action=el.dataset.action;
    if(action==='refresh'){await load();return;}if(action==='refresh-consultation-requests'){await load();return;}if(action==='assign-consultation'){await assignConsultation(el.dataset.requestId);return;}if(action==='assign-doctor-from-modal'){await assignDoctorFromModal(el);return;}if(action==='doctor-accept'){await respondToRequest(el.dataset.requestId,'accept');return;}if(action==='doctor-decline'){await respondToRequest(el.dataset.requestId,'decline');return;}
    if(action==='profile'){profileModal();return;}
    if(action==='notifications'){await notificationsModal();return;}
    if(action==='logout'){await auth.logout();return;}
    if(action==='asha-filter'){state.patientFilter=el.dataset.filter;render();return;}
    if(action==='doctor-filter'){state.queueFilter=el.dataset.filter;render();return;}
    if(action==='patient-details'){if(!el.dataset.patientId){ui.showToast('Patient record is missing an ID','danger');return;}await patientDetails(el.dataset.patientId,el.dataset.patientName);return;}
    if(action==='doctor-patient'){if(!el.dataset.patientId){ui.showToast('Patient record is missing an ID','danger');return;}await doctorPatient(el.dataset.patientId,el.dataset.appointmentId);return;}
    if(action==='doctor-documents'){await doctorDocuments(el.dataset.applicationId,el.dataset.doctorName);return;}if(action==='verification-filter'){state.admin.search=document.getElementById('admin-verification-search')?.value||'';state.admin.role=document.getElementById('admin-verification-role')?.value||'ALL';state.admin.status=document.getElementById('admin-verification-status')?.value||'ALL';state.admin.sort=document.getElementById('admin-verification-sort')?.value||'created_at';state.admin.page=1;await loadAdminVerification();render();return;}if(action==='verification-page'){state.admin.page=Math.max(1,Number(el.dataset.page)||1);await loadAdminVerification();render();return;}if(action==='verification-history'){try{const r=await api.verificationHistory({page:1,limit:20});overlay(`<section class="drawer" role="dialog" aria-modal="true"><div class="drawer-head"><div><h2>Verification history</h2><p>Immutable approval and rejection decisions.</p></div><button type="button" class="close-btn" data-close-overlay aria-label="Close">✕</button></div>${r.data?.length?r.data.map(x=>`<div class="audit-item"><div class="audit-action">${esc(x.decision)} · ${esc(x.applicantName)}</div><div class="audit-meta">${esc(x.applicationType)} · Reviewed by ${esc(x.reviewerName)} · ${esc(fmtDate(x.createdAt))}</div>${x.notes?`<div class="small-muted">${esc(x.notes)}</div>`:''}</div>`).join(''):empty('No verification history','No decisions have been recorded yet.')}</section>`,'drawer-backdrop');}catch(e){ui.showToast(e.message||'Unable to load history','danger');}return;}if(action==='audit-history'){try{const r=await api.adminAudit({page:1,limit:50});overlay(`<section class="drawer" role="dialog" aria-modal="true"><div class="drawer-head"><div><h2>Audit trail</h2><p>Recent platform security and operational events.</p></div><button type="button" class="close-btn" data-close-overlay aria-label="Close">✕</button></div>${r.data?.length?r.data.map(x=>`<div class="audit-item"><div class="audit-action">${esc(x.action)}</div><div class="audit-meta">${esc(x.resourceType)} · ${esc(x.actorName||'System')} · ${esc(fmtDate(x.createdAt))}</div><div class="small-muted">Request ${esc(x.requestId||'—')}</div></div>`).join(''):empty('No audit activity','No events recorded yet.')}</section>`,'drawer-backdrop');}catch(e){ui.showToast(e.message||'Unable to load audit trail','danger');}return;}if(action==='review-note'){overlay(`<section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>Review note</h2><p>Administrator decision note.</p></div><button type="button" class="close-btn" data-close-overlay aria-label="Close">✕</button></div><p>${esc(el.dataset.note||'No note')}</p></section>`);return;}if(action==='open-doctor-document'){await openDoctorDocument(el.dataset.applicationId,el.dataset.documentId);return;}if(action==='download-doctor-document'){try{const blob=await api.downloadDoctorDocument(el.dataset.applicationId,el.dataset.documentId,true);const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='verification-document';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){ui.showToast(e.message||'Unable to download document','danger');}return;}if(action==='reject'){await rejectUser(el.dataset.userId);return;}if(action==='read-notification'){try{await api.markNotificationRead(el.dataset.notificationId);el.closest('.drawer-backdrop')?.remove();await notificationsModal();}catch(e){ui.showToast(e.message||'Unable to update notification','danger');}return;}
    if(action==='approve'){el.disabled=true;try{await api.patch(`/admin/users/${encodeURIComponent(el.dataset.userId)}/approve`,{});ui.showToast('Account approved successfully','success');await load();}catch(e){el.disabled=false;ui.showToast(e.message||'Approval failed','danger');}return;}
    if(action==='patients'||action==='doctors'||action==='asha'||action==='users'||action==='appointments'||action==='consultations'||action==='prescriptions'||action==='queue'||action==='queue-waiting'||action==='sync'){return;}
  });

  document.addEventListener('input', event=>{if(event.target.id==='asha-search'){state.search=event.target.value;render();const input=document.getElementById('asha-search');if(input){input.focus();input.setSelectionRange(state.search.length,state.search.length);}}});
  window.addEventListener('online',updateNetworkStatus);
  window.addEventListener('offline',updateNetworkStatus);
})();
