import LegalPage from './LegalPage';

// Draft privacy notice. Written for Kenya's Data Protection Act, 2019;
// the operator must review it with a legal adviser before launch.
export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="16 November 2026">
      <h2>Who we are</h2>
      <p>
        Transtrack Kenya provides transport management and live tracking to universities, schools and companies
        (&ldquo;organisations&rdquo;). Each organisation decides who uses Transtrack and why, and is the data
        controller for its people&rsquo;s data. Transtrack processes that data on its behalf.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong> from your Google sign-in: your name, email address and profile photo.</li>
        <li><strong>Details your organisation records</strong>, such as your phone number, route and stop, and for drivers their licence and documents.</li>
        <li><strong>Live location of vehicles</strong>, sent from the driver&rsquo;s device while the driver area of the app is open. Passengers&rsquo; locations are not collected.</li>
        <li><strong>Ride bookings</strong>: the stop and run you choose, and the days you skip.</li>
        <li><strong>Fleet records</strong>: vehicles, maintenance, fuel purchases, defects and documents.</li>
        <li><strong>Payments</strong> made with M-Pesa: amount, phone number and receipt number. We never see your M-Pesa PIN.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run the transport service: show where a vehicle is, plan routes and stop times, and manage seats.</li>
        <li>To keep vehicles safe and legal: maintenance, inspections and document expiry.</li>
        <li>To detect unusual fuel use, when your organisation turns on fuel analysis. This runs on our own servers; no data is sent to outside AI services.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Vehicle location history is deleted automatically after 90 days (your organisation can shorten this).
        Other records are kept while your organisation uses Transtrack, and removed when it asks us to delete them.
      </p>

      <h2>Cookies</h2>
      <p>
        We use one essential cookie that keeps you signed in. It cannot be read by scripts and is only sent to our
        sign-in service. We do not use advertising or analytics cookies, so there is no cookie banner. Google may set
        its own cookies when you use &ldquo;Sign in with Google&rdquo;; see Google&rsquo;s privacy policy.
      </p>

      <h2>Who we share it with</h2>
      <p>
        People in your own organisation, according to their role. Each organisation&rsquo;s data is kept separate
        from every other organisation&rsquo;s. Service providers we rely on: Google (sign-in), Safaricom (M-Pesa) and
        OpenStreetMap (map images, which receive the map area you view but not who you are).
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct or delete your data, or object to how it is used. Contact your organisation&rsquo;s
        transport office first; they can reach us. You can also complain to the Office of the Data Protection
        Commissioner (ODPC) of Kenya.
      </p>

      <h2>Contact</h2>
      <p>Questions about this policy: contact your organisation&rsquo;s transport office.</p>
    </LegalPage>
  );
}
