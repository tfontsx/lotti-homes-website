/* =========================================================================
   SITE INDUCTION — Worker & Subcontractor Safety Induction
   Renders the 24-point induction from data, validates it, and writes a
   single row to the `site_inductions` table in Supabase (see
   supabase/schema.sql). Requires js/supabase-config.js to be filled in.
   ========================================================================= */

(function () {
  const QUESTIONS = [
    {
      id: 'company_safety',
      title: 'Company Safety',
      intro: 'I understand that I must comply with all LOTTI HOMES WHS policies, procedures, site rules and lawful directions.',
    },
    {
      id: 'fit_for_work',
      title: 'Fit for Work',
      intro: 'I confirm I am:',
      list: [
        'Fit for work',
        'Not affected by alcohol or illegal drugs',
        'Not impaired by medication',
        'Not suffering from fatigue that may affect my work',
      ],
      blocking: true,
    },
    {
      id: 'competency_licensing',
      title: 'Competency & Licensing',
      intro: 'I confirm I hold all licences, qualifications and competencies required to perform my work.',
      blocking: true,
    },
    {
      id: 'white_card',
      title: 'White Card',
      intro: 'I hold a current General Construction Induction (White Card).',
      blocking: true,
    },
    {
      id: 'ppe',
      title: 'Personal Protective Equipment (PPE)',
      intro: 'I understand I must wear the required PPE, including where applicable:',
      list: [
        'Safety boots',
        'High visibility clothing',
        'Hard hat',
        'Safety glasses',
        'Gloves',
        'Hearing protection',
        'Respiratory protection',
        'Harness',
      ],
    },
    {
      id: 'swms',
      title: 'Safe Work Method Statements (SWMS)',
      intro: 'I understand:',
      list: [
        'I must comply with all applicable SWMS.',
        'I must not perform high-risk construction work unless it is covered by an approved SWMS.',
        'If the work changes, I must notify the Site Supervisor.',
      ],
    },
    {
      id: 'site_rules',
      title: 'Site Rules',
      intro: 'I understand:',
      list: [
        'No unauthorised persons on site.',
        'Children are prohibited from construction areas.',
        'Smoking only in designated areas.',
        'No alcohol or illegal drugs.',
        'Keep the site secure.',
        'Follow all directions from the Site Supervisor.',
      ],
    },
    {
      id: 'heights',
      title: 'Working at Heights',
      intro: 'I understand:',
      list: [
        'Fall protection must be used where required.',
        'Edge protection must not be removed.',
        'Harnesses must be inspected before use.',
        'Roof work requires appropriate controls.',
        'Unsafe work at heights is prohibited.',
      ],
    },
    {
      id: 'ladders',
      title: 'Ladders',
      intro: 'I understand:',
      list: [
        'Ladders must be inspected.',
        'Three points of contact must be maintained.',
        'Ladders are for access or short-duration tasks only.',
        'Damaged ladders must not be used.',
      ],
    },
    {
      id: 'scaffolding',
      title: 'Scaffolding',
      intro: 'I understand:',
      list: [
        'Scaffolds must only be altered by authorised persons.',
        'Guardrails must remain installed.',
        'Safe access must be maintained.',
      ],
    },
    {
      id: 'ewp',
      title: 'Elevated Work Platforms (EWPs)',
      intro: 'I understand:',
      list: [
        'Only authorised operators may operate EWPs.',
        'Pre-start inspections are required.',
        'Harnesses must be worn where required.',
      ],
    },
    {
      id: 'excavations',
      title: 'Excavations',
      intro: 'I understand:',
      list: [
        'Excavations may contain hidden services.',
        'Trenches must not be entered unless safe.',
        'Services must be identified before digging.',
      ],
    },
    {
      id: 'electrical',
      title: 'Electrical Safety',
      intro: 'I understand:',
      list: [
        'Temporary power must be used safely.',
        'Damaged leads are prohibited.',
        'Electrical hazards must be reported immediately.',
      ],
    },
    {
      id: 'manual_handling',
      title: 'Manual Handling',
      intro: 'I understand:',
      list: [
        'Safe lifting techniques must be used.',
        'Mechanical lifting equipment should be used where practical.',
        'Assistance should be requested for heavy loads.',
      ],
    },
    {
      id: 'hazardous_chemicals',
      title: 'Hazardous Chemicals',
      intro: 'I understand:',
      list: [
        'SDS are available.',
        'Chemicals must be used according to manufacturer instructions.',
        'Appropriate PPE must be worn.',
      ],
    },
    {
      id: 'asbestos',
      title: 'Asbestos Awareness',
      intro: 'I understand:',
      list: [
        'Homes built before 2004 may contain asbestos-containing materials.',
        'I must not disturb suspected asbestos.',
        'If asbestos is suspected, I will stop work immediately and notify the Site Supervisor.',
      ],
    },
    {
      id: 'silica_dust',
      title: 'Silica Dust',
      intro: 'I understand:',
      list: [
        'Cutting concrete, bricks, tiles, stone or fibre cement can generate respirable crystalline silica.',
        'Dust suppression and respiratory protection must be used.',
        'Dry cutting without suitable controls is prohibited.',
      ],
    },
    {
      id: 'lead_paint',
      title: 'Lead Paint',
      intro: 'I understand:',
      list: [
        'Older painted surfaces may contain lead.',
        'Appropriate controls must be implemented before disturbing painted surfaces.',
      ],
    },
    {
      id: 'plant_equipment',
      title: 'Plant & Equipment',
      intro: 'I understand:',
      list: [
        'Plant must only be operated by authorised persons.',
        'Pre-start inspections are required.',
        'Defective equipment must be removed from service.',
      ],
    },
    {
      id: 'housekeeping',
      title: 'Housekeeping',
      intro: 'I understand:',
      list: [
        'Work areas must remain tidy.',
        'Waste must be removed regularly.',
        'Walkways and emergency exits must remain clear.',
      ],
    },
    {
      id: 'environmental',
      title: 'Environmental Protection',
      intro: 'I understand:',
      list: [
        'Waste must be disposed of correctly.',
        'Dust, sediment and chemicals must not enter stormwater.',
        'Noise and dust should be minimised.',
      ],
    },
    {
      id: 'incident_reporting',
      title: 'Incident Reporting',
      intro: 'I understand I must immediately report:',
      list: [
        'Injuries',
        'Near misses',
        'Unsafe conditions',
        'Property damage',
        'Environmental incidents',
      ],
    },
    {
      id: 'emergency_procedures',
      title: 'Emergency Procedures',
      intro: 'I understand:',
      list: [
        'Emergency contact numbers',
        'First aid arrangements',
        'Fire extinguisher locations',
        'Evacuation procedures',
        'Assembly point',
      ],
    },
    {
      id: 'stop_work_authority',
      title: 'Stop Work Authority',
      intro: 'I understand that I have the authority and responsibility to stop work if:',
      list: [
        'Conditions become unsafe.',
        'A serious hazard is identified.',
        'Work falls outside the approved SWMS.',
        'There is an immediate risk to health or safety.',
      ],
      blocking: false,
    },
  ];

  const DECLARATIONS = [
    { id: 'completed_induction', label: 'I have completed this induction.' },
    { id: 'understand_whs', label: "I understand my obligations under the Work Health and Safety Act 2012 (SA) and LOTTI HOMES' safety requirements." },
    { id: 'agree_policies', label: 'I agree to comply with all company policies, site rules and SWMS.' },
    { id: 'report_hazards', label: 'I will immediately report hazards, incidents and unsafe conditions.' },
    { id: 'understand_consequences', label: 'I understand failure to comply with these requirements may result in removal from site and termination of my engagement.' },
  ];

  const questionsEl = document.getElementById('questions');
  const progressFill = document.getElementById('progressFill');
  const progressCount = document.getElementById('progressCount');
  const declarationsEl = document.getElementById('declarations');
  const form = document.getElementById('inductionForm');
  const submitBtn = document.getElementById('submitBtn');
  const formNote = document.getElementById('formNote');
  const successEl = document.getElementById('successState');

  // ---- render questions -------------------------------------------------
  QUESTIONS.forEach((q, index) => {
    const num = index + 1;
    const card = document.createElement('div');
    card.className = 'question-card reveal';
    card.id = `card-${q.id}`;
    card.dataset.revealDelay = (index % 4) * 70;

    const listHtml = q.list
      ? `<ul class="question-card__list">${q.list.map((li) => `<li>${li}</li>`).join('')}</ul>`
      : '';

    card.innerHTML = `
      <div class="question-card__head">
        <span class="question-card__number">${num}.</span>
        <span class="question-card__title">${q.title}</span>
      </div>
      <p style="font-size:0.85rem; margin-bottom: ${q.list ? '0.5rem' : '1rem'};">${q.intro}</p>
      ${listHtml}
      <div class="yesno" role="radiogroup" aria-label="${q.title}">
        <input type="radio" name="${q.id}" id="${q.id}-yes" value="yes" required>
        <label for="${q.id}-yes">Yes</label>
        <input type="radio" name="${q.id}" id="${q.id}-no" value="no">
        <label for="${q.id}-no">No</label>
      </div>
      <p class="question-card__error">Please select Yes or No to continue.</p>
      ${q.blocking ? `
        <div class="block-warning" id="warning-${q.id}">
          <p>This means you cannot proceed to site. Please speak to your Site Supervisor before continuing.</p>
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

  // ---- render declarations ----------------------------------------------
  DECLARATIONS.forEach((d) => {
    const wrap = document.createElement('div');
    wrap.className = 'form-consent';
    wrap.innerHTML = `
      <input type="checkbox" id="${d.id}" name="${d.id}" required>
      <label for="${d.id}">${d.label}</label>
    `;
    declarationsEl.appendChild(wrap);
    wrap.querySelector('input').addEventListener('change', updateProgress);
  });

  // ---- progress + blocking state -----------------------------------------
  function updateProgress() {
    const total = QUESTIONS.length + DECLARATIONS.length;
    let answered = 0;
    QUESTIONS.forEach((q) => {
      if (form.querySelector(`input[name="${q.id}"]:checked`)) answered++;
    });
    DECLARATIONS.forEach((d) => {
      if (form.querySelector(`#${d.id}`).checked) answered++;
    });
    const pct = Math.round((answered / total) * 100);
    progressFill.style.width = `${pct}%`;
    progressCount.textContent = `${answered} / ${total}`;
  }

  function hasActiveBlock() {
    return QUESTIONS.some((q) => {
      if (!q.blocking) return false;
      const checked = form.querySelector(`input[name="${q.id}"]:checked`);
      return checked && checked.value === 'no';
    });
  }

  function updateSubmitState() {
    submitBtn.disabled = hasActiveBlock();
  }

  // ---- submit -------------------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formNote.textContent = '';
    formNote.className = 'form-note';

    if (hasActiveBlock()) {
      formNote.textContent = 'You cannot submit this induction while a critical safety question is marked "No". Please speak to your Site Supervisor.';
      formNote.className = 'form-note form-note--error';
      return;
    }

    let firstError = null;
    QUESTIONS.forEach((q) => {
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
    QUESTIONS.forEach((q) => {
      const checked = form.querySelector(`input[name="${q.id}"]:checked`);
      const entry = { answer: checked ? checked.value : null };
      const commentField = form.querySelector(`[name="comment_${q.id}"]`);
      if (commentField && commentField.value.trim()) entry.comment = commentField.value.trim();
      responses[q.id] = entry;
    });

    const payload = {
      worker_name: form.workerName.value.trim(),
      company: form.company.value.trim(),
      trade: form.trade.value.trim(),
      induction_date: form.inductionDate.value,
      supervisor: form.supervisor.value.trim(),
      responses,
      declaration_completed_induction: form.completed_induction.checked,
      declaration_understand_whs: form.understand_whs.checked,
      declaration_agree_policies: form.agree_policies.checked,
      declaration_report_hazards: form.report_hazards.checked,
      declaration_understand_consequences: form.understand_consequences.checked,
      signature_name: form.signatureName.value.trim(),
      user_agent: navigator.userAgent,
    };

    try {
      const client = window.supabase.createClient(config.url, config.anonKey);
      const { error } = await client.from('site_inductions').insert([payload]);
      if (error) throw error;

      document.getElementById('inductionFormWrap').classList.add('is-hidden');
      successEl.classList.add('is-visible');
      successEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      formNote.textContent = 'Something went wrong submitting your induction. Please try again or notify your Site Supervisor.';
      formNote.className = 'form-note form-note--error';
      submitBtn.disabled = false;
      submitBtn.querySelector('span').textContent = 'Submit Induction';
    }
  });

  updateProgress();
})();
