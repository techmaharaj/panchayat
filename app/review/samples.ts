/**
 * Synthetic submissions written by the team, never mixed with the corpus.
 * One specific, one empty, so the reviewer view can be demoed both ways.
 */
export interface Sample {
  id: string;
  label: string;
  title: string;
  abstract: string;
  speaker: { name: string; employer: string; bio: string };
}

export const SAMPLES: Sample[] = [
  {
    id: "specific",
    label: "Specific",
    title: "Backstage for 500 Engineers in a Regulated Bank",
    speaker: {
      name: "Rhea Nandakumar",
      employer: "Vantage Bank",
      bio: "Platform engineer at Vantage Bank. Previously ran the CI estate at a payments startup. First time speaking at KubeCon.",
    },
    abstract:
      "We rolled out Backstage 1.28 to 500 engineers across 14 regulated business units, and the hard part was never the catalog. Our first attempt failed: we modelled ownership from our LDAP groups, which were six years stale, and 40 percent of components resolved to teams that no longer existed. We rebuilt ownership from merge activity in GitLab instead, and catalog accuracy went from 61 percent to 94 percent in nine weeks. Onboarding a new service went from 3 weeks of tickets to 2 days, measured across 112 services. I will show the ownership resolver we wrote, the two audit controls our regulator made us add to the scaffolder, and the plugin we deleted after nobody opened it in four months. If you are running Backstage somewhere with auditors, the catalog is an access control problem wearing a developer portal costume.",
  },
  {
    id: "empty",
    label: "Empty",
    title: "Unlocking Developer Velocity With Platform Engineering",
    speaker: {
      name: "A. Visionary",
      employer: "Synergex Cloud",
      bio: "Thought leader in cloud native transformation, helping enterprises unlock value at scale.",
    },
    abstract:
      "In today's fast-paced cloud native landscape, organizations are under unprecedented pressure to deliver faster while maintaining reliability at scale. Platform engineering has emerged as the key to unlocking developer velocity and driving business outcomes. In this session, we will explore how leading organizations are leveraging internal developer platforms to empower their teams, reduce cognitive load, and accelerate time to market. We will discuss best practices, common pitfalls, and lessons learned from real-world transformations across the industry. Attendees will walk away with actionable insights and a practical roadmap for building a world-class platform that delights developers and delivers measurable business value. Join us to learn how our award-winning platform solution can help you on your cloud native journey.",
  },
];
