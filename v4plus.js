const $ = (id) => document.getElementById(id);
const state = { current: null, sigHistory: [], methodHistory: [] };

let audioCtx = null;
let audioReady = false;

const R = {
  int: (a, b) => Math.floor(Math.random() * (b - a + 1)) + a,
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
};

function renderMath(el, latex, display = true) {
  if (window.katex) el.innerHTML = katex.renderToString(latex, { throwOnError: false, displayMode: display });
  else el.textContent = latex;
}

function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  audioReady = true;
  return true;
}

function tone(freq, ms, type = 'sine', gain = 0.03, when = 0) {
  if (!audioReady || !audioCtx) return;
  const t0 = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.02);
}

function sfxClick(){
  tone(620, 60, 'triangle', 0.02);
}
function sfxSuccess(){
  tone(640, 90, 'triangle', 0.03, 0);
  tone(880, 110, 'triangle', 0.028, 0.08);
}
function sfxWrong(){
  tone(230, 130, 'sawtooth', 0.028, 0);
  tone(180, 120, 'sawtooth', 0.022, 0.07);
}

function normalizeLatex(s){
  return String(s || '')
    .toLowerCase()
    .replace(/\\exponentiale\b/g,'e')
    .replace(/\\imaginaryi\b/g,'i')
    .replace(/\\left|\\right/g,'')
    .replace(/\\,/g,'')
    .replace(/\s+/g,'')
    .replace(/\{\s*/g,'{')
    .replace(/\s*\}/g,'}')
    .replace(/\+c$/,'')
    .replace(/\\cdot/g,'');
}

function latexToMathExpr(lx){
  let s = String(lx || '');
  s = s.replace(/\\exponentialE\b/g, 'e').replace(/\\imaginaryI\b/g, 'i');
  s = s.replace(/\\left|\\right/g, '');
  s = s.replace(/\\,/g, '');
  s = s.replace(/\\pi/g, 'pi');
  s = s.replace(/\\arctan/g, 'atan').replace(/\\arcsin/g, 'asin').replace(/\\arccos/g, 'acos');
  s = s.replace(/\\sin/g, 'sin').replace(/\\cos/g, 'cos').replace(/\\tan/g, 'tan');
  s = s.replace(/\\ln/g, 'log');
  s = s.replace(/\\sqrt\{/g, 'sqrt(').replace(/\}/g, ')');

  while (/\\frac\{[^{}]*\}\{[^{}]*\}/.test(s)) {
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))');
  }

  s = s.replace(/[{}]/g, '(').replace(/\)\(/g, ')*(');
  s = s.replace(/\^/g, '^');

  s = s.replace(/\bC\b/g, '0').replace(/\bc\b/g, '0');

  // implicit multiplication fixes
  s = s.replace(/(\d)([a-zA-Z(])/g, '$1*$2');
  s = s.replace(/([)x])([a-zA-Z(\d])/g, '$1*$2');
  s = s.replace(/([a-zA-Z])\*(?=(sin|cos|tan|asin|acos|atan|sqrt|log)\()/g, '$1*');

  return s;
}

function approxEquivalent(userLatex, targetLatex){
  if (typeof math === 'undefined') return false;
  try {
    const uExpr = latexToMathExpr(userLatex);
    const tExpr = latexToMathExpr(targetLatex);

    const hasX = /(^|[^a-zA-Z])x([^a-zA-Z]|$)/.test(uExpr + tExpr);

    if (!hasX) {
      const uVal = math.evaluate(uExpr);
      const tVal = math.evaluate(tExpr);
      return Number.isFinite(uVal) && Number.isFinite(tVal) && Math.abs(uVal - tVal) < 1e-6;
    }

    const points = [0.7, 1.1, 1.7, 2.3, 3.1];
    const deltas = [];
    for (const x of points) {
      const scope = { x, pi: Math.PI, e: Math.E };
      const uVal = math.evaluate(uExpr, scope);
      const tVal = math.evaluate(tExpr, scope);
      if (!Number.isFinite(uVal) || !Number.isFinite(tVal)) continue;
      deltas.push(uVal - tVal);
    }
    if (deltas.length < 3) return false;
    const mean = deltas.reduce((a,b)=>a+b,0)/deltas.length;
    const maxDev = Math.max(...deltas.map(d=>Math.abs(d-mean)));
    return maxDev < 1e-5;
  } catch {
    return false;
  }
}

function checkCurrentAnswer(){
  const out = $('checkResult');
  if (!state.current) { out.textContent = 'Generate a problem first.'; return; }
  const mf = $('answerField');
  const user = mf?.getValue ? mf.getValue('latex') : '';
  if (!user || !user.trim()) { out.textContent = 'Type an answer first.'; return; }

  const targetNorm = normalizeLatex(state.current.a);
  const userNorm = normalizeLatex(user);

  const exact = userNorm === targetNorm;
  const addCRelaxed = (userNorm + '+c') === targetNorm || userNorm === (targetNorm + '+c');

  if (exact || addCRelaxed) {
    out.textContent = '✅ Correct (symbol match)';
    out.style.color = '#7fe7a7';
    sfxSuccess();
    return;
  }

  if (approxEquivalent(user, state.current.a)) {
    out.textContent = '✅ Correct (equivalent form detected)';
    out.style.color = '#7fe7a7';
    sfxSuccess();
    return;
  }

  out.textContent = '❌ Not matched yet. Try equivalent form or tap Solution to compare formatting.';
  out.style.color = '#ffb2b2';
  sfxWrong();
}

function P(method, p, a, sig, steps) { return { method, p, a, sig, steps }; }
function remember(sig, method) {
  state.sigHistory.push(sig);
  if (state.sigHistory.length > 1200) state.sigHistory.shift();
  state.methodHistory.push(method);
  if (state.methodHistory.length > 30) state.methodHistory.shift();
}
function seen(sig) { return state.sigHistory.includes(sig); }
function recentMethodCount(method) { return state.methodHistory.filter(m => m === method).length; }

// ---------- families ----------
// Level 1
const f_power = () => { const n=R.int(1,120); return P('Power rule',`\\int x^{${n}}dx`,`\\frac{x^{${n+1}}}{${n+1}}+C`,`pow-${n}`,[`Power rule`]); };
const f_poly2 = () => { const a=R.int(2,80),b=R.int(2,80),n=R.int(1,20),m=R.int(0,18); return P('Linearity',`\\int(${a}x^{${n}}-${b}x^{${m}})dx`,`\\frac{${a}x^{${n+1}}}{${n+1}}-\\frac{${b}x^{${m+1}}}{${m+1}}+C`,`lin2-${a}-${n}-${b}-${m}`,[`Split terms`]); };
const f_const = () => { const c=R.int(2,200); return P('Constant',`\\int ${c}\\,dx`,`${c}x+C`,`const-${c}`,[`Integral of constant is cx`]); };

// Level 2
const f_usub_aff = () => { const a=R.int(2,60),b=R.int(1,60),n=R.int(2,9); return P('u-sub',`\\int(${a}x+${b})^{${n}}dx`,`\\frac{(${a}x+${b})^{${n+1}}}{${a*(n+1)}}+C`,`usub-aff-${a}-${b}-${n}`,[`u=${a}x+${b}`]); };
const f_log = () => { const a=R.int(2,50),b=R.int(1,50); return P('Log derivative',`\\int\\frac{1}{${a}x+${b}}dx`,`\\frac{1}{${a}}\\ln|${a}x+${b}|+C`,`log-${a}-${b}`,[`f'/f pattern`]); };
const f_exp = () => { const a=R.int(2,45); return P('Exponential',`\\int e^{${a}x}dx`,`\\frac{e^{${a}x}}{${a}}+C`,`exp-${a}`,[`u=${a}x`]); };
const f_trig_basic = () => { const a=R.int(1,30); return R.pick([
  P('Trig basic',`\\int\\sin(${a}x)dx`,`-\\frac{\\cos(${a}x)}{${a}}+C`,`sin-${a}`,[`sin rule`]),
  P('Trig basic',`\\int\\cos(${a}x)dx`,`\\frac{\\sin(${a}x)}{${a}}+C`,`cos-${a}`,[`cos rule`]),
]); };

// Level 3
const f_pf_simple = () => { const a=R.int(1,25),b=R.int(26,70); return P('Partial fractions',`\\int\\frac{1}{(x+${a})(x+${b})}dx`,`\\frac{1}{${b-a}}\\ln\\left|\\frac{x+${a}}{x+${b}}\\right|+C`,`pf-s-${a}-${b}`,[`A/(x+a)+B/(x+b)`]); };
const f_ibp_xnln = () => { const n=R.int(2,30); return P('IBP',`\\int x^{${n}}\\ln(x)dx`,`\\frac{x^{${n+1}}\\ln x}{${n+1}}-\\frac{x^{${n+1}}}{${(n+1)*(n+1)}}+C`,`ibp-xnln-${n}`,[`u=lnx`]); };
const f_trig_pow = () => { const n=R.int(2,24); return P('Trig substitution',`\\int\\sin^{${n}}(x)\\cos(x)dx`,`\\frac{\\sin^{${n+1}}(x)}{${n+1}}+C`,`trigpow-${n}`,[`u=sinx`]); };
const f_definite_pow = () => { const n=R.int(1,16),u=R.int(1,10); return P('Definite',`\\int_0^{${u}}x^{${n}}dx`,`\\frac{${u}^{${n+1}}}{${n+1}}`,`defpow-${n}-${u}`,[`apply bounds`]); };
const f_improper_p = () => { const p=R.int(2,12); return P('Improper',`\\int_1^{\\infty}\\frac{1}{x^{${p}}}dx`,`\\frac{1}{${p-1}}`,`imp-${p}`,[`p-test`]); };

// Level 4
const f_ibp_xcos = () => { const a=R.int(2,55); return P('IBP chain',`\\int x\\cos(${a}x)dx`,`\\frac{x\\sin(${a}x)}{${a}}+\\frac{\\cos(${a}x)}{${a*a}}+C`,`ibp-xcos-${a}`,[`u=x, dv=cos(kx)dx`]); };
const f_arctan = () => { const a=R.int(2,35); return P('Inverse trig',`\\int\\frac{dx}{x^2+${a*a}}`,`\\frac{1}{${a}}\\arctan\\left(\\frac{x}{${a}}\\right)+C`,`arctan-${a}`,[`x^2+a^2 form`]); };
const f_trig_sub = () => { const a=R.int(2,35); return P('Trig substitution',`\\int\\frac{dx}{\\sqrt{${a*a}-x^2}}`,`\\arcsin\\left(\\frac{x}{${a}}\\right)+C`,`trigsub-${a}`,[`x=asinθ`]); };
const f_tan = () => { const k=R.int(2,20); return P('Trig identity',`\\int\\tan(${k}x)dx`,`-\\frac{1}{${k}}\\ln|\\cos(${k}x)|+C`,`tan-${k}`,[`tan=sin/cos`]); };

// Level 5
const f_exptrig = () => { const a=R.int(2,24),b=R.int(1,24); return P('Repeated IBP',`\\int e^{${a}x}\\sin(${b}x)dx`,`\\frac{e^{${a}x}(${a}\\sin(${b}x)-${b}\\cos(${b}x))}{${a*a+b*b}}+C`,`exptrig-${a}-${b}`,[`IBP twice`]); };
const f_rat_reduce = () => { const a=R.int(2,60); return P('Rational reduction',`\\int\\frac{x^2}{x^2+${a}}dx`,`x-\\sqrt{${a}}\\arctan\\left(\\frac{x}{\\sqrt{${a}}}\\right)+C`,`ratred-${a}`,[`split 1-a/(x^2+a)`]); };
const f_def_ln = () => { const n=R.int(2,90); return P('Definite family',`\\int_0^1x^{${n}}\\ln(x)dx`,`-\\frac{1}{(${n+1})^2}`,`defln-${n}`,[`known family by IBP`]); };

// Level 6
const f_arcsec = () => { const a=R.int(2,30); return P('Arcsec form',`\\int\\frac{dx}{x\\sqrt{x^2-${a*a}}}` ,`\\frac{1}{${a}}\\operatorname{arcsec}\\left(\\frac{|x|}{${a}}\\right)+C`,`arcsec-${a}`,[`x=asecθ`]); };
const f_laplace_sin = () => { const a=R.int(2,24),b=R.int(1,24); return P('Laplace-style improper',`\\int_0^{\\infty}e^{-${a}x}\\sin(${b}x)\\,dx`,`\\frac{${b}}{${a*a+b*b}}`,`lapsin-${a}-${b}`,[`\\text{Laplace transform}`]); };
const f_reduction_form = () => { const n=R.int(2,12),a=R.int(2,24); return P('Reduction formula flavor',`\\int x^{${n}}e^{${a}x}dx`,`e^{${a}x}P_${n}(x)+C`,`reduct-${n}-${a}`,[`\\text{repeated IBP produces polynomial }P_${n}(x)`]); };

// Level 7 (bizarre pack)
const f_complex_cos = () => { const a=R.int(2,24),b=R.int(2,24); return P('Complex decomposition',`\\int e^{${a}x}\\cos(${b}x)dx`,`\\frac{e^{${a}x}(${a}\\cos(${b}x)+${b}\\sin(${b}x))}{${a*a+b*b}}+C`,`ccos-${a}-${b}`,[`Re of complex exponential integral`]); };
const f_param_trick = () => { const b=R.int(2,30); return P('Parameter differentiation',`I(a)=\\int_0^{\\infty}e^{-ax}\\sin(${b}x)\\,dx`,`I(a)=\\frac{${b}}{a^2+${b*b}}`,`param-${b}`,[`\\text{Differentiate/integrate a parameterized family}`]); };
const f_hard_pf = () => { const n=R.int(2,10),m=R.int(2,10); return P('Hard partial fractions',`\\int\\frac{x^{${n}}}{(x+1)(x+2)^{${m}}}\\,dx`,`\\text{long division + PF decomposition}+C`,`hpf-${n}-${m}`,[`\\text{Divide first, then partial fractions}`]); };
const f_bizarre_nested = () => {
  const a=R.int(2,10),b=R.int(1,10);
  return P('Nested transform',`\\int\\frac{\\ln(${a}x+${b})}{${a}x+${b}}\\,dx`,`\\frac{1}{2${a}}\\left(\\ln(${a}x+${b})\\right)^2+C`,`nest-${a}-${b}`,[`\\text{Set }u=\\ln(ax+b),\\;du=\\frac{a}{ax+b}dx`]);
};
const f_weird_def = () => {
  const n=R.int(2,12);
  return P('Beta-function flavored',`\\int_0^1x^{${n}}(1-x)\\,dx`,`\\frac{1}{(${n+1})(${n+2})}` ,`beta-${n}`,[`Expand or use Beta identity`]);
};

function compose(A, B) {
  const pa = A.p.replace('\\int','').replace(/\\,?dx/g,'');
  const pb = B.p.replace('\\int','').replace(/\\,?dx/g,'');
  const aa = A.a.replace('+C','');
  const ab = B.a.replace('+C','');
  return P('Composed linearity',`\\int\\left(${pa}+${pb}\\right)dx`,`${aa}+${ab}+C`,`cmb-${A.sig}-${B.sig}`,[`Linearity over sum of two structures`]);
}

const LEVELS = {
  1:[f_power,f_poly2,f_const],
  2:[f_usub_aff,f_log,f_exp,f_trig_basic],
  3:[f_pf_simple,f_ibp_xnln,f_trig_pow,f_definite_pow,f_improper_p],
  4:[f_ibp_xcos,f_arctan,f_trig_sub,f_tan,f_improper_p],
  5:[f_exptrig,f_rat_reduce,f_def_ln,f_ibp_xnln,f_trig_sub],
  6:[f_arcsec,f_laplace_sin,f_reduction_form,f_def_ln,f_exptrig],
  7:[f_complex_cos,f_param_trick,f_hard_pf,f_bizarre_nested,f_weird_def,f_arcsec,f_laplace_sin],
};

function weightedPickFamilies(level) {
  const base = LEVELS[level] || LEVELS[1];
  // method diversity pressure: avoid repeating same method too much lately
  const scored = base.map(fn => {
    const sample = fn();
    const penalty = recentMethodCount(sample.method) * 0.25;
    const score = Math.max(0.1, 1.0 - penalty);
    return { fn, score };
  });
  const sum = scored.reduce((s,x)=>s+x.score,0);
  let t = Math.random()*sum;
  for(const x of scored){ t -= x.score; if(t<=0) return x.fn; }
  return scored[scored.length-1].fn;
}

function generateProblem() {
  const mode = $('difficulty').value;
  const level = mode === 'chaos' ? R.int(1,7) : Number(mode);

  for (let i=0; i<300; i++) {
    const fA = weightedPickFamilies(level);
    let p = fA();

    // structural composition probability increases with difficulty
    const compProb = level>=7 ? 0.45 : level>=5 ? 0.3 : level>=3 ? 0.18 : 0.05;
    if (Math.random() < compProb) {
      const neighbor = clamp(level + R.pick([-1,0,1]), 1, 7);
      const fB = weightedPickFamilies(neighbor);
      p = compose(p, fB());
    }

    if (!seen(p.sig)) {
      remember(p.sig, p.method);
      return { ...p, level, complexity: p.method.includes('Composed') ? 'composed' : 'single' };
    }
  }

  const fallback = weightedPickFamilies(level)();
  remember(fallback.sig, fallback.method);
  return { ...fallback, level, complexity: 'fallback' };
}

function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }

function stepToLatex(step){
  const s = String(step || '').trim();
  if (!s) return '\\text{Method hint}';
  // If it already contains a LaTeX command, trust it as math/text-latex.
  if (/\\[a-zA-Z]+/.test(s)) return s;
  // Otherwise treat as plain text to preserve spacing.
  const safe = s.replace(/\\/g,'').replace(/\{/g,'(').replace(/\}/g,')');
  return `\\text{${safe}}`;
}

function showHint(){
  if(!state.current) return;
  renderMath($('hint'), stepToLatex(state.current.steps[0] || 'Identify dominant structure first.'), false);
  $('hint').classList.remove('muted');
}

function showSolution(){
  if(!state.current) return;
  const ans = window.katex
    ? katex.renderToString(state.current.a, { throwOnError:false, displayMode:true })
    : state.current.a;
  const steps = state.current.steps.map(s => {
    const line = stepToLatex(s);
    return window.katex
      ? `<li>${katex.renderToString(line,{throwOnError:false,displayMode:false})}</li>`
      : `<li>${s}</li>`;
  }).join('');
  $('solution').innerHTML = `${ans}<div><strong>Method</strong><ol>${steps}</ol></div>`;
  $('solution').classList.remove('muted');
}

function getMF(){ return $('answerField'); }

function normalizeMathLiveLatex(latex){
  return String(latex || '')
    .replace(/\\exponentialE\b/g, 'e')
    .replace(/\\imaginaryI\b/g, 'i');
}

function updateAnswerPreview(){
  const mf = getMF();
  const out = $('answerPreview');
  if (!mf || !out) return;
  const raw = (mf.getValue ? mf.getValue('latex') : '').trim();
  if (!raw) {
    out.textContent = 'Your formatted input will appear here.';
    out.classList.add('muted');
    return;
  }
  out.classList.remove('muted');
  const latex = normalizeMathLiveLatex(raw);
  renderMath(out, latex, false);
}

function jumpToNextSlotMF(){
  const mf = getMF();
  if (!mf || !mf.executeCommand) return;
  mf.focus();
  mf.executeCommand('moveToNextPlaceholder');
}

function buildTemplate(problem){
  if (!problem) return '#?';
  const method = String(problem.method || '').toLowerCase();
  const p = String(problem.p || '');

  if (method.includes('power rule')) return '\\frac{x^{#?}}{#?}+C';
  if (method.includes('constant')) return '\\frac{#?x^{#?}}{#?}+C';
  if (method.includes('u-sub')) return '\\frac{(#?x+#?)^{#?}}{#?}+C';
  if (method.includes('log')) return '\\frac{1}{#?}\\ln\\left|#?x+#?\\right|+C';
  if (method.includes('trig basic') && p.includes('sin(')) return '-\\frac{\\cos(#?x)}{#?}+C';
  if (method.includes('trig basic') && p.includes('cos(')) return '\\frac{\\sin(#?x)}{#?}+C';
  if (method.includes('ibp chain') || method.includes('ibp')) return '#? + #? + C';
  if (method.includes('partial fractions')) return '#?\\ln|x+#?| + #?\\ln|x+#?| + C';
  if (method.includes('definite') || method.includes('improper')) return '#?';
  if (method.includes('inverse trig') || method.includes('arctan')) return '\\frac{1}{#?}\\arctan\\left(\\frac{x}{#?}\\right)+C';
  if (method.includes('trig substitution')) return '\\arcsin\\left(\\frac{x}{#?}\\right)+C';
  if (method.includes('laplace')) return '\\frac{#?}{#?}';
  if (method.includes('complex')) return '\\frac{e^{#?x}(#?\\cos(#?x)+#?\\sin(#?x))}{#?}+C';
  if (method.includes('reduction')) return 'e^{#?x}P_n(x)+C';

  return '#?+C';
}

function wire(){
  const unlockAudio = () => ensureAudio();
  document.addEventListener('touchstart', unlockAudio, { once:true });
  document.addEventListener('mousedown', unlockAudio, { once:true });

  $('generate').onclick = ()=>{
    const p = generateProblem();
    state.current = p;
    renderMath($('problem'), p.p, true);
    $('meta').textContent = `Band ${p.level} · ${p.method} · ${p.complexity} · ${p.sig}`;
    $('hint').textContent='No hint yet.'; $('hint').classList.add('muted');
    $('solution').textContent='No solution yet.'; $('solution').classList.add('muted');
    $('checkResult').textContent='No check yet.';
    $('checkResult').style.color='';
    $('hintBtn').disabled=false;
    $('solBtn').disabled=false;
  };
  $('hintBtn').onclick = showHint;
  $('solBtn').onclick = showSolution;
  $('checkAnswer').onclick = checkCurrentAnswer;

  const mf = getMF();

  if (mf) {
    mf.setOptions?.({ virtualKeyboardMode: 'manual' });
    mf.addEventListener('input', updateAnswerPreview);
    mf.addEventListener('focus', updateAnswerPreview);

    // Reverted to stable calculator behavior (no global focus/hide hooks)
    // so it only engages when the math-field itself is focused.
    mf.addEventListener('focus', updateAnswerPreview);
  }

  // Button click sounds (excluding MathLive internal keyboard)
  document.querySelectorAll('button').forEach(btn => {
    if (btn.id === 'checkAnswer') return; // checkAnswer gets success/wrong sounds
    btn.addEventListener('click', () => {
      if (ensureAudio()) sfxClick();
    });
  });

  updateAnswerPreview();
}

wire();