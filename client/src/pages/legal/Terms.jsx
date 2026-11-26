import LegalPage from './LegalPage';

// Draft terms of service; to be reviewed by a legal adviser before launch.
export default function Terms() {
  return (
    <LegalPage title="Terms of service" updated="16 November 2026">
      <h2>Using Transtrack</h2>
      <p>
        Transtrack is provided to organisations, who invite their staff, drivers, passengers and parents. By signing
        in you agree to use it only for your organisation&rsquo;s transport and to follow its rules.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Sign in only with your own Google account and keep it secure.</li>
        <li>Do not try to see another organisation&rsquo;s data or get around access controls.</li>
        <li>Your organisation can remove your access at any time.</li>
      </ul>

      <h2>Drivers</h2>
      <p>
        Location sharing is part of the driver&rsquo;s job while the driver area is open. Never use the app in a way
        that distracts you while driving: stop safely first.
      </p>

      <h2>Live information</h2>
      <p>
        Locations, arrival times and stop times are estimates. They depend on the driver&rsquo;s phone signal and
        traffic, and can be late or wrong. Do not rely on them where safety is at stake.
      </p>

      <h2>Payments</h2>
      <p>Fees are set by your organisation. Questions about charges or refunds go to your organisation.</p>

      <h2>Changes</h2>
      <p>We may update these terms. If a change matters, we will tell you in the app before it applies.</p>
    </LegalPage>
  );
}
