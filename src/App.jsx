import { useEffect, useRef } from 'react'
import { initMeridian } from './scene'

const MARKUP = `<!-- ============================== LOADER ============================== -->
<div class="loader" id="loader">
  <video id="loader-video" class="loader-video" autoplay muted loop playsinline>
    <source src="/videos/loader-grunge.mp4" type="video/mp4" />
  </video>
  <div class="loader-top">
    <div class="mono">Kier</div>
    <div class="mono sub gothic">Cold Work</div>
  </div>
  <button class="loader-enter" id="loader-enter" type="button">ACCESS</button>
  <div class="loader-bot">
    <div class="row">
      <div class="mono status" id="loader-status">Loading the experience</div>
      <div class="mono pct"><b id="pct">000</b><span>%</span></div>
    </div>
    <div class="loader-track"><div class="loader-bar" id="bar"></div></div>
  </div>
</div>

<!-- ============================== HEADER ============================== -->
<header class="header">
  <a href="#" class="brand mono"><i class="brand-mark"></i>KIER</a>
  <nav class="nav">
    <a href="#about">About</a>
    <a href="#cardA">Work</a>
    <a href="#creative">Creative</a>
    <a href="#contact">Contact</a>
  </nav>
  <a class="btn-ghost" href="#contact">Say hello<i class="dot"></i></a>
  <button class="burger" aria-label="Menu"><span></span></button>
</header>

<!-- ============================== SCENE =============================== -->
<canvas id="scene" aria-hidden="true"></canvas>
<canvas id="pointer-tracer" aria-hidden="true"></canvas>

<!-- ============================ SCROLL BAR ============================= -->
<div class="scroll-progress" aria-hidden="true">
  <div class="scroll-progress-fill" id="scroll-progress-fill"></div>
</div>

<!-- ============================ SCREEN FILTER =========================== -->
<div class="screen-filter" aria-hidden="true"></div>

<!-- ============================= OVERLAYS ============================= -->
<div class="overlay" id="ov1">

  <div class="hero-core">
    <div class="hero-eyebrow mono reveal-unit" data-unit data-delay="120">
      <i class="pip"></i>Kier Suministrado
    </div>

    <h1 class="display hero-h1" data-split="letter" data-delay="220">KIER</h1>

    <p class="mono hero-subtitle reveal-unit" data-unit data-delay="380">Digital Creative</p>
  </div>

  <div class="hero-band">
    <div class="hero-trust">
      <div class="mono trust-label reveal-unit" data-unit data-delay="900">Tools in rotation</div>
      <div class="trust-marks reveal-unit" data-unit data-delay="1000" aria-label="Tools">
        <span class="mark"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="2.4" fill="currentColor"/></svg>Figma</span>
        <span class="mark"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2l7 8-7 8-7-8z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>Photoshop</span>
        <span class="mark"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="6" height="6" fill="currentColor"/><rect x="11" y="11" width="6" height="6" fill="currentColor"/><rect x="11" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>Illustrator</span>
        <span class="mark"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 14L7 6l3 5 3-8 4 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>HTML / CSS / JS</span>
        <span class="mark"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="7" cy="10" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="13" cy="10" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>Photography</span>
      </div>
    </div>
  </div>
</div>


<div class="overlay" id="ov3">
  <div class="act3-tl"><h2 class="display" data-split="letter">Vibe coding,<br/>structured.</h2></div>
  <p class="act3-l mono" data-split="word" data-delay="200">Design, then experiment, then build. The vibe is the last step, not the excuse.</p>
  <p class="act3-r mono" data-split="word" data-delay="260">Reduced motion honoured across the page.</p>
  <div class="act3-br"><h2 class="display gothic" data-split="letter" data-delay="120">Cold Work</h2></div>
  <a class="act3-cta btn btn-fill reveal-unit" href="#contact" data-unit data-delay="500">
    Get in touch
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3 13L13 3M6 3h7v7"/></svg>
  </a>
</div>

<!-- ============================== TRACKS ============================== -->
<main>
  <div class="tracks" aria-hidden="true">
    <div class="track" id="t1"></div>
    <div class="track" id="t3"></div>
    <div class="tail"></div>
  </div>

  <div class="content">
    <!-- CARD A — project spotlight -->
    <section class="card-wrap" id="cardA">
      <div class="card card-a" data-card>
        <div class="text">
          <h2 class="display" data-split="letter" data-io>Chrome Vault</h2>
          <div class="cols">
            <div>
              <div class="num mono">[ 01 ]</div>
              <p data-split="word" data-io data-delay="120">A fashion and jewelry reselling concept built around chrome aesthetics — branding, visual identity, and a digital storefront designed to feel like the accessory itself.</p>
            </div>
            <div>
              <div class="num mono">[ 02 ]</div>
              <p data-split="word" data-io data-delay="180">Built on the same liquid-chrome visual language as this site, carried through packaging, social templates, and a logo mark meant to catch light like polished metal.</p>
            </div>
          </div>
        </div>
        <div class="visual" data-mask data-io><canvas id="card-canvas"></canvas></div>
      </div>
    </section>

    <!-- CARD A2 — SkillBridge -->
    <section class="card-wrap" id="cardSkillBridge">
      <div class="card card-a" data-card>
        <div class="text">
          <h2 class="display" data-split="letter" data-io>SkillBridge</h2>
          <div class="cols">
            <div>
              <div class="num mono">[ 01 ]</div>
              <p data-split="word" data-io data-delay="120">A platform that connects people with skills to job, project, internship, and freelance opportunities that match their abilities.</p>
            </div>
            <div>
              <div class="num mono">[ 02 ]</div>
              <p data-split="word" data-io data-delay="180">Built around a simple idea — talent shouldn't go unmatched because of where you look. SkillBridge narrows that gap, turning ability into access.</p>
            </div>
          </div>
        </div>
        <div class="visual" data-mask data-io><canvas id="card-canvas-2"></canvas></div>
      </div>
    </section>

    <!-- EMERGE — About / philosophy -->
    <section class="emerge" id="about">
      <div class="emerge-text">
        <div class="emerge-eyebrow mono reveal-unit" data-unit data-io><i class="pip"></i>Who is Kier?</div>
        <h2 class="display" data-split="letter" data-io>Technology is my<br/>medium. Design is<br/>my language.</h2>
        <p class="emerge-lede body" data-split="word" data-io data-delay="140">
          Kier is a digital creative [Developer/Designer] that builds [digital experiences/websites/apps] by blending [technology/design/branding/3D] and a distinct visual style
        </p>
        <p class="emerge-lede body" data-split="word" data-io data-delay="180">
          Extra specialities: [Front-end/3D/Photography/Branding/UI Design/AI] Worked with digital projects/fashion/creative concepts/technology/branding
        </p>
        <ul class="emerge-list reveal-unit" data-unit data-io data-delay="260">
          <li><span class="mono idx">01</span>Fashion graphics, photo editing, and UI design come before the code</li>
          <li><span class="mono idx">02</span>Photography across fashion, editorial, street, and experimental work</li>
          <li><span class="mono idx">03</span>Completed Ignite Philippines, a Wadhwani Foundation entrepreneurship program (42 hrs)</li>
        </ul>
      </div>
      <div class="emerge-visual" data-io>
        <canvas id="emerge-canvas"></canvas>
      </div>
    </section>

    <!-- CARD B — FAQ -->
    <section class="card-wrap" id="creative">
      <div class="card card-b" data-card>
        <svg class="asterisk spin" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11 1h2v22h-2z"/><path d="M1 11h22v2H1z" transform="rotate(45 12 12)"/><path d="M1 11h22v2H1z" transform="rotate(-45 12 12)"/><path d="M1 11h22v2H1z"/>
        </svg>
        <h2 class="display" data-split="letter" data-io>Frequently asked</h2>
        <div class="faq reveal-unit" data-unit data-io data-delay="200">
          <div class="faq-item open">
            <button class="faq-q" aria-expanded="true">What do you actually do?<i class="faq-mark"></i></button>
            <div class="faq-a"><div>I design and build — front-end development, graphic design, UI/UX, and photography. I usually design first, then figure out how to make it work as code.</div></div>
          </div>
          <div class="faq-item">
            <button class="faq-q" aria-expanded="false">Are you available for freelance work?<i class="faq-mark"></i></button>
            <div class="faq-a"><div>Yes — reach out through the form below, or find me on Instagram or GitHub.</div></div>
          </div>
          <div class="faq-item">
            <button class="faq-q" aria-expanded="false">What tools do you use?<i class="faq-mark"></i></button>
            <div class="faq-a"><div>Figma, Photoshop, and Illustrator for design. HTML, CSS, and JavaScript for build. A camera for the photography side.</div></div>
          </div>
          <div class="faq-item">
            <button class="faq-q" aria-expanded="false">Where can I see more?<i class="faq-mark"></i></button>
            <div class="faq-a"><div>Instagram for content and process, GitHub for code — both linked below.</div></div>
          </div>
        </div>
      </div>
    </section>

    <!-- FOOTER -->
    <footer class="footer" id="contact">
      <h2 class="display" data-split="letter" data-io data-once>Let's make something.</h2>
      <form class="pill reveal-unit" data-unit data-io data-once data-delay="150" id="contact-form">
        <input type="text" placeholder="Name" aria-label="Name" required />
        <input type="email" placeholder="Email" aria-label="Email" required />
        <button type="submit">Send</button>
      </form>
      <div class="foot-rule"></div>
      <div class="foot-grid">
        <div class="foot-brand">
          <div class="brand mono"><i class="brand-mark"></i>KIER</div>
          <p class="mono">Design. Build. Experiment. Cold Work, 2026.</p>
        </div>
        <div class="cols">
          <div class="col">
            <h4 class="mono">Work</h4>
            <a href="#cardA">Chrome Vault</a>
            <a href="#cardSkillBridge">SkillBridge</a>
          </div>
          <div class="col">
            <h4 class="mono">Connect</h4>
            <a href="https://www.instagram.com/ki.er__/" target="_blank" rel="noreferrer">Instagram</a>
            <a href="https://github.com/kiercantmiss" target="_blank" rel="noreferrer">GitHub</a>
            <a href="mailto:hello@kiersuministrado.com">Email</a>
          </div>
          <div class="col">
            <h4 class="mono">Verified</h4>
            <div class="credential-badge">
              <img src="/images/cert-qr.png" alt="Scan to verify Kier's Ignite Philippines certificate" class="credential-qr" />
              <div>
                <p class="credential-label">Ignite Philippines</p>
                <p class="credential-sub muted small">Entrepreneurship · Wadhwani Foundation, 2026</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  </div>
</main>`

export default function App() {
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    initMeridian()
  }, [])
  return <div dangerouslySetInnerHTML={{ __html: MARKUP }} />
}
