/* =========================================================================
   DAILY SITE CHECK-IN
   Renders a short daily pre-start checklist, validates it, and writes a
   single row to the `daily_checkins` table in Supabase (see
   supabase/schema.sql). Requires js/supabase-config.js to be filled in.
   ========================================================================= */

(function () {
  const CHECKS = [
    {
      id: 'fit_for_work',
      title: 'Fit for Work',
      intro: 'I am fit for work today — not affected by alcohol, illegal drugs, impairing medication or fatigue.',
      blocking: true,
    },
    {
      id: 'ppe_worn',
      title: 'PPE',
      intro: 'I am wearing all PPE required for today’s tasks.',
      blocking: true,
    },
    {
      id: 'swms_reviewed',
      title: 'SWMS Reviewed',
      intro: 'I have reviewed the Safe Work Method Statement(s) relevant to today’s tasks.',
      blocking: true,
    },
    {
      id: 'hazards_checked',
      title: 'Work Area & Hazards',
      intro: 'I have inspected my work area today and identified any hazards.',
      blocking: false,
    },
    {
      id: 'plant_prestart',
      title: 'Plant & Equipment Pre-Start',
      intro: 'Pre-start checks are complete on any plant or equipment I will use today (if applicable).',
      blocking: false,
    },
    {
      id: 'weather_suitable',
      title: 'Weather',
      intro: 'Weather conditions today are suitable to safely carry out my work.',
      blocking: false,
    },
  ];

  const questionsEl = document.getElementById('questions');
  const progressFill = document.getElementById('progressFill');
  const progressCount = document.getElementById('progressCount');
  const form = document.getElementById('checkinForm');
  const submitBtn = document.getElementById('submitBtn');
  const formNote = document.getElementById('formNote');
  const successEl = document.getElementById('successState');

  CHECKS.forEach((q, index) => {
    const num = index + 1;
    const card = document.createElement('div');
    card.className = 'question-card reveal';
    card.id = `card-${q.id}`;
    card.dataset.revealDelay = (index % 4) * 70;

    card.innerHTML = `
      <div class="question-card__head">
        <span class="question-card__number">${num}.</span>
        <span class="question-card__title">${q.title}</span>
      </div>
      <p style="font-size:0.85rem; margin-bottom: 1rem;">${q.intro}</p>
      <div class="yesno" role="radiogroup" aria-label="${q.title}">
        <input type="radio" name="${q.id}" id="${q.id}-yes" value="yes" required>
        <label for="${q.id}-yes">Yes</label>
        <input type="radio" name="${q.id}" id="${q.id}-no" value="no">
        <label for="${q.id}-no">No</label>
      </div>
      <p class="question-card__error">Please select Yes or No to continue.</p>
      ${q.blocking ? `
        <div class="block-warning" id="warning-${q.id}">
          <p>This means you cannot proceed to work. Please speak to your Site Supervisor before continuing.</p>
        </div>
      ` : `
        <div class="comment-box" id="comment-wrap-${q.id}">
          <label for="comment-${q.id}">Please provide details</label>
          <textarea id="comment-${q.id}" name="comment_${q.id}" placeholder="Add a short note so your Site Supervisor can follow up..."></textarea>
        </div>
      `}
    `;

    questionsEl.appendChild(card);

    const radios = card.querySelectorAll(`input[name="${q.id}"]`);
    radios.forEach((radio) => {
      radio.addEventListener('change', () => {
        card.classList.remove('has-error');
        updateProgress();

        if (q.blocking) {
          const warning = document.getElementById(`warning-${q.id}`);
          warning.classList.toggle('is-visible', radio.value === 'no' && radio.checked);
          updateSubmitState();
        } else {
          const commentWrap = document.getElementById(`comment-wrap-${q.id}`);
          const isNo = card.querySelector(`input[name="${q.id}"]:checked`)?.value === 'no';
          commentWrap.classList.toggle('is-visible', isNo);
        }
      });
    });
  });

  function updateProgress() {
    const total = CHECKS.length;
    let answered = 0;
    CHECKS.forEach((q) => {
      if (form.querySelector(`input[name="${q.id}"]:checked`)) answered++;
    });
    const pct = Math.round((answered / total) * 100);
    progressFill.style.width = `${pct}%`;
    progressCount.textContent = `${answered} / ${total}`;
  }

  function hasActiveBlock() {
    return CHECKS.some((q) => {
      if (!q.blocking) return false;
      const checked = form.querySelector(`input[name="${q.id}"]:checked`);
      return checked && checked.value === 'no';
    });
  }

  function updateSubmitState() {
    submitBtn.disabled = hasActiveBlock();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formNote.textContent = '';
    formNote.className = 'form-note';

    if (hasActiveBlock()) {
      formNote.textContent = 'You cannot submit this check-in while a critical question is marked "No". Please speak to your Site Supervisor.';
      formNote.className = 'form-note form-note--error';
      return;
    }

    let firstError = null;
    CHECKS.forEach((q) => {
      const card = document.getElementById(`card-${q.id}`);
      const checked = form.querySelector(`input[name="${q.id}"]:checked`);
      if (!checked) {
        card.classList.add('has-error');
        if (!firstError) firstError = card;
      }
    });

    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      formNote.textContent = 'Please answer every question before submitting.';
      formNote.className = 'form-note form-note--error';
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const config = window.SUPABASE_CONFIG;
    if (!config || !config.url || config.url.includes('YOUR-PROJECT-REF')) {
      formNote.textContent = 'This form is not yet connected to a database. Contact the site administrator.';
      formNote.className = 'form-note form-note--error';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Submitting...';

    const responses = {};
    CHECKS.forEach((q) => {
      const checked = form.querySelector(`input[name="${q.id}"]:checked`);
      const entry = { answer: checked ? checked.value : null };
      const commentField = form.querySelector(`[name="comment_${q.id}"]`);
      if (commentField && commentField.value.trim()) entry.comment = commentField.value.trim();
      responses[q.id] = entry;
    });

    const payload = {
      worker_name: form.workerName.value.trim(),
      company: form.company.value.trim(),
      checkin_date: form.checkinDate.value,
      site_address: form.siteAddress.value.trim(),
      responses,
      hazards_identified: form.hazardsIdentified.value.trim() || null,
      incidents_near_misses: form.incidents.value.trim() || null,
      additional_notes: form.additionalNotes.value.trim() || null,
      signature_name: form.signatureName.value.trim(),
      user_agent: navigator.userAgent,
    };

    try {
      const client = window.supabase.createClient(config.url, config.anonKey);
      const { error } = await client.from('daily_checkins').insert([payload]);
      if (error) throw error;

      document.getElementById('checkinFormWrap').classList.add('is-hidden');
      successEl.classList.add('is-visible');
      successEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      formNote.textContent = 'Something went wrong submitting your check-in. Please try again or notify your Site Supervisor.';
      formNote.className = 'form-note form-note--error';
      submitBtn.disabled = false;
      submitBtn.querySelector('span').textContent = 'Submit Check-In';
    }
  });

  updateProgress();
})();
