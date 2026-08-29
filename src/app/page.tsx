import Link from "next/link";
import { Eyebrow } from "@/components/Eyebrow";
import styles from "./page.module.css";

// The fixture's source on GitHub (lives in this project's repo).
const FIXTURE_GITHUB_URL =
  "https://github.com/Utsav2/ecomply/tree/main/fixture/NonCompliantWebApp";

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.headline}>ecomply</h1>
      </div>

      <div className={styles.columns}>
        <section className={styles.reposCol}>
          <Eyebrow>Repos</Eyebrow>
          <div className={styles.repoPanel}>
            <div className={styles.repoRow}>
              <Link href="/library" className={styles.repoName}>
                NonCompliantWebApp
              </Link>
              <a
                href={FIXTURE_GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className={styles.repoSource}
              >
                View source on GitHub ↗
              </a>
            </div>
          </div>
        </section>

        <section className={styles.pitchCol}>
          <p className={styles.pitchLead}>ecomply lets you</p>
          <ol className={styles.pitchList}>
            <li>Continuously monitor control coverage</li>
            <li>Ask audit questions</li>
            <li>Generate evidence bundles</li>
            <li>Improve your control posture</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
