import { createFileRoute, Link } from "@tanstack/react-router";
import { InvestmentSimulator } from "@/components/investment-simulator";
import { ThemeToggle } from "@/components/theme-provider";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FinLitter — Understand money. Explore decisions." },
      { name: "description", content: "Practical personal finance tools for students: learn the trade-offs, test assumptions and organize your money." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return <main className="marketing-site">
    <header className="marketing-nav">
      <Link to="/" className="brand-lockup" aria-label="FinLitter home"><span className="brand-mark">F</span><span>FinLitter</span></Link>
      <nav aria-label="Public navigation"><a href="#learn">Learn</a><a href="#tools">Tools</a><Link to="/login">Log in</Link><ThemeToggle /><Link className="button button--primary marketing-nav__cta" to="/signup">Get early access</Link></nav>
    </header>

    <section className="marketing-hero">
      <div className="marketing-hero__copy">
        <p className="product-eyebrow"><span className="eyebrow-dot" /> Built for the first money decisions</p>
        <h1>Understand money.<br /><em>Explore decisions.</em><br />Build confidence.</h1>
        <p className="marketing-hero__lead">A practical place for college students in India to learn personal finance by working through their own assumptions, plans and records.</p>
        <div className="marketing-actions"><Link to="/signup" className="button button--primary">Get early access <span aria-hidden="true">↗</span></Link><Link to="/calculators" className="button button--quiet">Explore the tools</Link></div>
        <p className="marketing-note">Create an account to use the features currently available. Calculations and simulations are estimates, not advice.</p>
      </div>
      <div className="hero-board" aria-label="FinLitter product overview">
        <div className="hero-board__top"><span className="eyebrow-label">YOUR MONEY TOOLKIT</span><span className="status-pill"><i /> Learning by doing</span></div>
        <div className="hero-board__title"><span>Start with a question.</span><strong>Make the trade-off visible.</strong></div>
        <div className="hero-board__steps">
          <div><span className="step-index">01</span><span><b>Set the assumptions</b><small>Loan, saving or investing scenario</small></span><span className="step-arrow">↗</span></div>
          <div><span className="step-index">02</span><span><b>See how it is calculated</b><small>Clear conventions and estimates</small></span><span className="step-arrow">↗</span></div>
          <div><span className="step-index">03</span><span><b>Keep your records together</b><small>Accounts, activity and stock trades</small></span><span className="step-arrow">↗</span></div>
        </div>
        <div className="hero-board__foot"><span>Personal finance, made more understandable.</span><span className="hero-board__mark">FL / 01</span></div>
      </div>
    </section>

    <section className="value-strip" id="learn" aria-label="FinLitter approach">
      <div><span>01</span><p><b>Understand</b><small>Learn what the numbers describe.</small></p></div>
      <div><span>02</span><p><b>Explore</b><small>Change assumptions and compare scenarios.</small></p></div>
      <div><span>03</span><p><b>Build confidence</b><small>Organize the financial picture you control.</small></p></div>
    </section>

    <section className="marketing-tools" id="tools">
      <div className="section-intro"><p className="product-eyebrow">A useful starting point</p><h2>Tools for decisions you are already facing.</h2><p>Begin with a calculation. Explore an investment scenario. Keep your real records separate from modelled outcomes.</p></div>
      <div className="tool-grid">
        <article className="tool-card tool-card--calculator"><span className="tool-card__number">01 / CALCULATE</span><div className="tool-card__icon" aria-hidden="true">∑</div><h3>Make the costs easier to compare.</h3><p>Estimate a loan EMI, regular investment growth, CAGR or fixed deposit maturity. Every result explains the assumptions behind it.</p><Link to="/calculators">Explore financial calculators <span aria-hidden="true">→</span></Link></article>
        <article className="tool-card tool-card--portfolio"><span className="tool-card__number">02 / RECORD</span><div className="tool-card__icon" aria-hidden="true">↗</div><h3>Keep a clearer investment record.</h3><p>Track completed stock trades, FIFO cost basis and prices you enter. Missing and stale prices stay visible as incomplete valuations.</p><Link to="/investments">See portfolio tools <span aria-hidden="true">→</span></Link></article>
        <article className="tool-card tool-card--market"><span className="tool-card__number">03 / FOLLOW</span><div className="tool-card__icon" aria-hidden="true">⌁</div><h3>Read sourced market events.</h3><p>Browse processed filings and market events from configured sources, with source links and event history where available.</p><Link to="/news">Explore the news feed <span aria-hidden="true">→</span></Link></article>
      </div>
    </section>

    <section className="simulation-demo" aria-labelledby="simulation-demo-heading">
      <div className="simulation-demo__intro"><p className="product-eyebrow">Try a model, not a promise</p><h2 id="simulation-demo-heading">Explore how assumptions shape a long-term scenario.</h2><p>The investment simulator generates hypothetical paths using stated return, volatility and correlation assumptions. Outcomes are conditional on the model and are not predictions or guarantees.</p><Link to="/signup" className="text-link">Save your financial workspace <span aria-hidden="true">→</span></Link></div>
      <div className="simulation-demo__panel"><InvestmentSimulator /></div>
    </section>

    <section className="early-access">
      <div><p className="product-eyebrow">Take the next step</p><h2>Start with the questions you have.</h2><p>Use the tools to learn, test your assumptions and build a financial picture that is yours.</p></div>
      <Link to="/signup" className="button button--light">Get early access <span aria-hidden="true">↗</span></Link>
    </section>

    <footer className="marketing-footer"><Link to="/" className="brand-lockup"><span className="brand-mark">F</span><span>FinLitter</span></Link><p>Understand money. Explore decisions. Build financial confidence.</p><div><Link to="/login">Log in</Link><Link to="/signup">Create account</Link></div></footer>
  </main>;
}
