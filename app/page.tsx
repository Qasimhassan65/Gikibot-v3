import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="page-root">
      <div className="card card-home">
        <div className="card-header">
          <div>
            <div className="card-title">GIKI Admissions Assistant</div>
            <div className="card-subtitle">
              Select your program to start chatting with the official policy.
            </div>
          </div>
          <div className="card-subtitle">Unofficial helper · Uses GIKI docs</div>
        </div>

        <p style={{ fontSize: 13, marginBottom: 4 }}>
          What are you interested in?
        </p>

        <div className="button-row">
          <Link
            href="/chat?type=undergrad"
            className="btn"
          >
            Undergraduate Admissions
          </Link>
          <Link
            href="/chat?type=grad"
            className="btn"
          >
            Graduate Admissions
          </Link>
        </div>

        <p
          style={{
            fontSize: 11,
            color: '#999',
            marginTop: 18,
            lineHeight: 1.4,
          }}
        >
          Answers are based strictly on the official GIKI admissions policy
          documents. If something isn&apos;t in the document, the assistant will
          tell you.
        </p>
      </div>
    </div>
  );
}
