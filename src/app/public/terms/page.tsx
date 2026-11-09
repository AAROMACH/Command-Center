import { LegalPage } from '@/components/legal-page';

export const metadata = { title: 'Terms of Service · AAROMACH' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service and End-User License Agreement" updated="November 9, 2026">
      <p>
        These terms govern use of the AAROMACH Command Center app and its public pages and forms (the &ldquo;App&rdquo;),
        operated by AAROMACH (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By using the App you agree to them.
      </p>

      <section>
        <h2>License</h2>
        <p>
          We grant you a limited, non-exclusive, non-transferable, revocable license to use the App for its intended purpose:
          working with AAROMACH as a client, staff member or technician, or submitting a request or approving a quote or invoice.
          You may not copy, resell, reverse-engineer or attempt to gain unauthorized access to the App.
        </p>
      </section>

      <section>
        <h2>Accounts</h2>
        <p>
          Accounts are created or approved by AAROMACH. Keep your login private; you are responsible for activity under your
          account. We may suspend or remove access at any time, for example when employment or a client relationship ends.
        </p>
      </section>

      <section>
        <h2>Your information and content</h2>
        <p>
          You keep ownership of information and files you submit, and allow us to use them to provide our services, as described
          in our <a href="/public/privacy">Privacy Policy</a>. Information you submit should be accurate and lawful to share.
        </p>
      </section>

      <section>
        <h2>Quotes, invoices and services</h2>
        <p>
          Quotes, invoices and service work are also governed by the specific quote, invoice or service agreement for that
          work. If they conflict with these terms, the specific agreement controls.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <p>
          The App connects to services such as Intuit QuickBooks Online, Google Firebase, Resend and Twilio. Their use is subject
          to their own terms; we are not responsible for their availability.
        </p>
      </section>

      <section>
        <h2>Disclaimer and limitation of liability</h2>
        <p>
          The App is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind. To the extent
          allowed by law, AAROMACH is not liable for indirect, incidental or consequential damages, or for lost data or profits,
          arising from use of the App. Our total liability for any claim about the App is limited to $100.
        </p>
      </section>

      <section>
        <h2>Governing law</h2>
        <p>These terms are governed by the laws of the State of Michigan.</p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms; continued use means you accept the latest version. Questions:{' '}
          <a href="mailto:support@aaromach.com">support@aaromach.com</a> · (313) 241-0588.
        </p>
      </section>
    </LegalPage>
  );
}
