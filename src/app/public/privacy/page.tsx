import { LegalPage } from '@/components/legal-page';

export const metadata = { title: 'Privacy Policy · AAROMACH' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="November 9, 2026">
      <p>
        AAROMACH (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides low-voltage, IT and field services in Metro Detroit, and runs the
        AAROMACH Command Center app (the &ldquo;App&rdquo;) for our staff, technicians and clients. This policy explains what
        information we collect through the App and our forms, how we use it, and the choices you have.
      </p>

      <section>
        <h2>Information we collect</h2>
        <ul>
          <li><strong>Contact details</strong> you give us: name, company, email, phone, service address.</li>
          <li><strong>Service information</strong>: requests, quotes, invoices, job notes, photos and files you or our team upload.</li>
          <li><strong>Account information</strong> for people who sign in: login email, role and notification preferences.</li>
          <li><strong>Staff and technician records</strong>: schedules, job logs, mileage, location check-ins on jobs, and pay records.</li>
          <li><strong>Accounting data</strong>: if an administrator connects QuickBooks Online, we exchange customers, invoices and payments with it.</li>
          <li><strong>Technical data</strong>: basic device and log information needed to keep the App secure and working.</li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To respond to requests, schedule and perform work, and send quotes, invoices and receipts.</li>
          <li>To keep our books accurate, including syncing invoices and payments with QuickBooks Online.</li>
          <li>To send service emails, texts and app notifications you&rsquo;ve asked for or that relate to your work with us.</li>
          <li>To run payroll and manage our staff.</li>
          <li>To secure the App, prevent fraud and meet legal obligations.</li>
        </ul>
        <p className="mt-2">We do not sell your personal information, and we do not use it for third-party advertising.</p>
      </section>

      <section>
        <h2>Who we share it with</h2>
        <p>Only service providers that help us run the App, under their own privacy and security terms:</p>
        <ul>
          <li>Google Firebase / Google Cloud (hosting, database, file storage, sign-in)</li>
          <li>Intuit QuickBooks Online (accounting), when connected</li>
          <li>Resend (email delivery) and Twilio (text messages)</li>
        </ul>
        <p className="mt-2">We may also disclose information when required by law or to protect our rights, customers or staff.</p>
      </section>

      <section>
        <h2>QuickBooks data</h2>
        <p>
          When an AAROMACH administrator connects QuickBooks Online, the App accesses only the company file they authorize, and
          only to create and read customers, invoices and payments for our own business. Access tokens are stored server-side,
          are never shown to other users, and are deleted when QuickBooks is disconnected in the App&rsquo;s settings.
        </p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>
          We keep records for as long as we need them to serve you and to meet tax, accounting and legal requirements, then
          delete or anonymize them.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Data is encrypted in transit and at rest by our hosting provider, access is limited by role, and staff only see what
          their job requires. No system is perfectly secure, but we work to protect your information.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You can ask us to see, correct or delete your information, or to stop non-essential emails or texts, by contacting us
          below. Signed-in users can change notification settings in the App.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>AAROMACH · <a href="mailto:support@aaromach.com">support@aaromach.com</a> · (313) 241-0588</p>
        <p className="mt-2">We may update this policy; the date at the top shows the latest version.</p>
      </section>
    </LegalPage>
  );
}
