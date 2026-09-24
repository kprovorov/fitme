import type { Metadata } from "next";

export const metadata: Metadata = {
  openGraph: {
    url: "https://fitmeproject.com/terms",
  },
};

function TermsOfServicePage() {
  return (
    <div className="prose prose-base dark:prose-invert p-6">
      <h2>Terms of Service (ToS)</h2>
      <p>Effective Date: 20 February 2025</p>
      <p>
        Please read these Terms of Service (&quot;ToS&quot;) carefully before
        using the Fitme mobile application (&quot;App&quot;) provided by Kyrylo
        Provorov (referred to as &quot;Developer&quot;). By using the App, you
        agree to be bound by these ToS.
      </p>
      <h4>Use and Restrictions:</h4>
      <ul>
        <li>
          The App is intended for personal use only and should not be used for
          any illegal activities.
        </li>
        <li>
          Users are responsible for the accuracy and legality of the data
          entered into the App.
        </li>
        <li>
          Users must comply with all applicable laws and regulations while using
          the App.
        </li>
      </ul>
      <h4>Subscription-Based Services:</h4>
      <p>The App offers subscription-based services with different tiers:</p>
      <ul>
        <li>
          Free Tier: Includes limited functionality, such as a maximum of 1
          workout.
        </li>
        <li>Pro Tier: Provides unlimited functionality.</li>
      </ul>
      <h4>Pricing and Renewal:</h4>
      <ul>
        <li>
          The subscription-based services are auto-renewable and can be billed
          monthly or yearly, with the yearly subscription offering a discounted
          price compared to the monthly subscription.
        </li>
        <li>
          Users can cancel their subscription at any time, and the service will
          continue until the end of the current billing period.
        </li>
        <li>
          If a user upgrades to a higher tier during an active subscription,
          they will be reimbursed for the lower tier and only need to pay the
          difference for the higher tier.
        </li>
        <li>
          Downgrading to a lower tier will take effect after the current billing
          period for the higher tier ends.
        </li>
      </ul>
      <h4>App Store Terms:</h4>
      <p>
        The App is subject to the standard terms and conditions set forth by the
        Apple App Store.
      </p>
      <p>
        By using the App, you acknowledge that you have read, understood, and
        agreed to these ToS.
      </p>
      <p>
        If you have any questions or concerns regarding these ToS, please
        contact us at{" "}
        <a href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>
          {process.env.NEXT_PUBLIC_SUPPORT_EMAIL}
        </a>
        .
      </p>

      <h2>End User License Agreement (EULA)</h2>
      <p>Effective Date: 27 July 2024</p>
      <p>
        This End User License Agreement (&quot;Agreement&quot;) is a legal
        agreement between you (referred to as &quot;User&quot; or
        &quot;you&quot;) and Kyrylo Provorov (referred to as
        &quot;Developer&quot;) governing the use of the Fitme mobile application
        (&quot;App&quot;).
      </p>
      <h4>Permitted Use:</h4>
      <p>
        By installing, accessing, or using the App, you agree to the following
        terms and conditions. The App is provided solely for personal,
        non-commercial use. You agree not to use the App for any illegal
        activities or in violation of any applicable laws or regulations.
      </p>
      <h4>Limitation of Liability:</h4>
      <p>
        To the maximum extent permitted by law, the Developer shall not be
        liable for any direct, indirect, incidental, consequential, or punitive
        damages arising out of or relating to the use or inability to use the
        App. The Developer does not guarantee the accuracy, completeness, or
        reliability of the information provided by the App.
      </p>
      <h4>Intellectual Property:</h4>
      <p>
        The App, including all its content, features, and functionality, is
        owned by the Developer and is protected by intellectual property laws.
        You acknowledge that you have no ownership or intellectual property
        rights in the App.
      </p>
      <h4>Dispute Resolution:</h4>
      <p>
        Any dispute, claim, or controversy arising out of or relating to this
        Agreement or the use of the App shall be resolved through negotiation
        and, if required, through binding arbitration conducted by a mutually
        agreed-upon arbitrator.
      </p>
      <h4>Miscellaneous:</h4>
      <p>
        This Agreement constitutes the entire agreement between you and the
        Developer regarding the use of the App. If any provision of this
        Agreement is found to be invalid or unenforceable, it shall not affect
        the validity or enforceability of the remaining provisions. The failure
        of the Developer to exercise any right or enforce any provision of this
        Agreement shall not constitute a waiver of such right or provision.
      </p>
      <p>
        By installing, accessing, or using the App, you acknowledge that you
        have read, understood, and agreed to be bound by this EULA.
      </p>
      <p>
        If you have any questions or concerns regarding this Agreement, please
        contact us at{" "}
        <a href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>
          {process.env.NEXT_PUBLIC_SUPPORT_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}

export default TermsOfServicePage;
