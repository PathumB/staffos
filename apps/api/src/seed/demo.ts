import type { RoleCode } from '@staffos/shared';
import * as argon2 from 'argon2';
import type { PrismaClient } from '../generated/prisma/client';
import { ARGON2_OPTIONS } from '../modules/auth/argon2.options';

/** Shared password for every demo account (shown on the README / demo card). Demo data only. */
export const DEMO_PASSWORD = 'StaffOS-Demo-2026!';

// Fictional people and companies only (CLAUDE.md §9).
export const DEMO_USERS: { email: string; firstName: string; lastName: string; role: RoleCode }[] =
  [
    { email: 'admin@staffos.demo', firstName: 'Layla', lastName: 'Haddad', role: 'SUPER_ADMIN' },
    { email: 'hr@staffos.demo', firstName: 'Omar', lastName: 'Farouk', role: 'HR_MANAGER' },
    { email: 'recruiter@staffos.demo', firstName: 'Priya', lastName: 'Nair', role: 'RECRUITER' },
    { email: 'am@staffos.demo', firstName: 'Daniel', lastName: 'Mensah', role: 'ACCOUNT_MANAGER' },
    { email: 'hm@staffos.demo', firstName: 'Fatima', lastName: 'Al Zaabi', role: 'HIRING_MANAGER' },
    { email: 'finance@staffos.demo', firstName: 'Arjun', lastName: 'Mehta', role: 'FINANCE' },
    { email: 'employee@staffos.demo', firstName: 'Joseph', lastName: 'Mwangi', role: 'EMPLOYEE' },
    { email: 'client@staffos.demo', firstName: 'Khalid', lastName: 'Rahman', role: 'CLIENT_USER' },
  ];

const DEMO_CLIENT_TRN = '100000000000001';

/** Demo accounts per role (idempotent). Requires seedRbac first. */
export async function seedDemo(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, ARGON2_OPTIONS);
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  const ids = new Map<RoleCode, string>();

  for (const u of DEMO_USERS.filter((d) => d.role !== 'CLIENT_USER')) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        passwordHash,
        status: 'ACTIVE',
        passwordChangedAt: new Date(),
        roles: { create: [{ roleId: roles.get(u.role)! }] },
      },
    });
    ids.set(u.role, user.id);
  }

  const client = await prisma.client.upsert({
    where: { trn: DEMO_CLIENT_TRN },
    update: {},
    create: {
      name: 'Gulf Build Contracting LLC',
      industry: 'CONSTRUCTION',
      trn: DEMO_CLIENT_TRN,
      city: 'Dubai',
      emirate: 'DUBAI',
      addressLine1: 'Office 1204, Al Quoz Business Tower',
      accountManagerId: ids.get('ACCOUNT_MANAGER')!,
      createdById: ids.get('SUPER_ADMIN')!,
    },
  });

  const clientUser = DEMO_USERS.find((d) => d.role === 'CLIENT_USER')!;
  await prisma.user.upsert({
    where: { email: clientUser.email },
    update: {},
    create: {
      email: clientUser.email,
      firstName: clientUser.firstName,
      lastName: clientUser.lastName,
      passwordHash,
      status: 'ACTIVE',
      passwordChangedAt: new Date(),
      clientId: client.id,
      roles: { create: [{ roleId: roles.get('CLIENT_USER')! }] },
    },
  });

  const employeeUserId = ids.get('EMPLOYEE')!;
  const employeeUser = DEMO_USERS.find((d) => d.role === 'EMPLOYEE')!;
  await prisma.employee.upsert({
    where: { userId: employeeUserId },
    update: {},
    create: {
      employeeNumber: 'EMP-000001',
      userId: employeeUserId,
      firstName: employeeUser.firstName,
      lastName: employeeUser.lastName,
      email: employeeUser.email,
      status: 'ACTIVE',
      hireDate: new Date('2026-01-15'),
      createdById: ids.get('SUPER_ADMIN')!,
    },
  });
}

// ── CRM demo data (fictional companies) ──

type DemoClient = {
  trn: string;
  name: string;
  industry: 'CONSTRUCTION' | 'LOGISTICS' | 'FACILITIES' | 'HEALTHCARE';
  city: string;
  emirate: 'DUBAI' | 'ABU_DHABI' | 'SHARJAH';
  contact: { firstName: string; lastName: string; jobTitle: string; email: string; phone: string };
  requests: {
    roleTitle: string;
    category: 'DRIVER' | 'CONSTRUCTION' | 'FACILITIES' | 'HEALTHCARE' | 'ELECTRICAL';
    headcount: number;
    location: string;
    status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED';
    startInDays: number;
  }[];
};

const DEMO_CLIENTS: DemoClient[] = [
  {
    trn: DEMO_CLIENT_TRN,
    name: 'Gulf Build Contracting LLC',
    industry: 'CONSTRUCTION',
    city: 'Dubai',
    emirate: 'DUBAI',
    contact: {
      firstName: 'Khalid',
      lastName: 'Rahman',
      jobTitle: 'Projects Director',
      email: 'client@staffos.demo',
      phone: '+971 4 555 0101',
    },
    requests: [
      {
        roleTitle: 'Heavy Vehicle Driver',
        category: 'DRIVER',
        headcount: 25,
        location: 'Dubai South',
        status: 'PENDING_APPROVAL',
        startInDays: 30,
      },
      {
        roleTitle: 'Site Electrician',
        category: 'ELECTRICAL',
        headcount: 6,
        location: 'Al Quoz',
        status: 'APPROVED',
        startInDays: 21,
      },
    ],
  },
  {
    trn: '100000000000002',
    name: 'Al Noor Logistics LLC',
    industry: 'LOGISTICS',
    city: 'Abu Dhabi',
    emirate: 'ABU_DHABI',
    contact: {
      firstName: 'Mariam',
      lastName: 'Haddad',
      jobTitle: 'Operations Manager',
      email: 'mariam.haddad@alnoor-logistics.example',
      phone: '+971 2 555 0102',
    },
    requests: [
      {
        roleTitle: 'Forklift Operator',
        category: 'DRIVER',
        headcount: 8,
        location: 'KEZAD',
        status: 'APPROVED',
        startInDays: 14,
      },
    ],
  },
  {
    trn: '100000000000003',
    name: 'Emirates Facility Services',
    industry: 'FACILITIES',
    city: 'Sharjah',
    emirate: 'SHARJAH',
    contact: {
      firstName: 'Sanjay',
      lastName: 'Iyer',
      jobTitle: 'HR Lead',
      email: 'sanjay.iyer@efs.example',
      phone: '+971 6 555 0103',
    },
    requests: [
      {
        roleTitle: 'HVAC Technician',
        category: 'FACILITIES',
        headcount: 12,
        location: 'Sharjah Industrial Area',
        status: 'DRAFT',
        startInDays: 45,
      },
    ],
  },
  {
    trn: '100000000000004',
    name: 'Seha Care Medical Centre',
    industry: 'HEALTHCARE',
    city: 'Dubai',
    emirate: 'DUBAI',
    contact: {
      firstName: 'Aisha',
      lastName: 'Karim',
      jobTitle: 'Nursing Director',
      email: 'aisha.karim@sehacare.example',
      phone: '+971 4 555 0104',
    },
    requests: [
      {
        roleTitle: 'Registered Nurse',
        category: 'HEALTHCARE',
        headcount: 5,
        location: 'Jumeirah',
        status: 'APPROVED',
        startInDays: 20,
      },
    ],
  },
];

/** Clients, contacts, a project and requests in each state (idempotent: skips clients that have requests). */
export async function seedDemoCrm(prisma: PrismaClient): Promise<void> {
  const am = await prisma.user.findUniqueOrThrow({ where: { email: 'am@staffos.demo' } });
  const hr = await prisma.user.findUniqueOrThrow({ where: { email: 'hr@staffos.demo' } });
  const day = 24 * 60 * 60 * 1000;
  const dateIn = (days: number) =>
    new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime() + days * day;

  for (const c of DEMO_CLIENTS) {
    const client = await prisma.client.upsert({
      where: { trn: c.trn },
      update: {},
      create: {
        trn: c.trn,
        name: c.name,
        industry: c.industry,
        city: c.city,
        emirate: c.emirate,
        accountManagerId: am.id,
        createdById: am.id,
      },
    });
    if ((await prisma.manpowerRequest.count({ where: { clientId: client.id } })) > 0) continue;

    const portalUser = await prisma.user.findUnique({ where: { email: c.contact.email } });
    await prisma.clientContact.create({
      data: {
        ...c.contact,
        clientId: client.id,
        isPrimary: true,
        portalUserId: portalUser?.id,
        createdById: am.id,
      },
    });
    await prisma.activity.create({
      data: {
        clientId: client.id,
        type: 'MEETING',
        subject: 'Quarterly workforce planning',
        body: 'Reviewed upcoming project demand.',
        createdById: am.id,
      },
    });
    if (c.industry === 'CONSTRUCTION') {
      await prisma.project.create({
        data: {
          clientId: client.id,
          name: 'Dubai South Logistics Hub',
          code: 'DSLH',
          location: 'Dubai South',
          emirate: 'DUBAI',
          status: 'ACTIVE',
          createdById: am.id,
        },
      });
    }
    for (const r of c.requests) {
      const submitted = r.status !== 'DRAFT';
      await prisma.manpowerRequest.create({
        data: {
          clientId: client.id,
          roleTitle: r.roleTitle,
          category: r.category,
          headcount: r.headcount,
          location: r.location,
          emirate: c.emirate,
          startDate: new Date(dateIn(r.startInDays)),
          durationMonths: 12,
          billRateMinFils: 4000,
          billRateMaxFils: 6000,
          status: r.status,
          submittedAt: submitted ? new Date() : null,
          decidedAt: r.status === 'APPROVED' ? new Date() : null,
          decidedById: r.status === 'APPROVED' && r.headcount > 20 ? hr.id : null,
          decisionComment:
            r.status === 'APPROVED' && r.headcount <= 20 ? 'Auto-approved: headcount ≤ 20.' : null,
          createdById: am.id,
        },
      });
    }
  }
}

// ── Recruitment demo data (fictional people) ──

const DEMO_CANDIDATES = [
  {
    firstName: 'Rania',
    lastName: 'Saeed',
    title: 'Warehouse Operator',
    years: 5,
    skills: ['Forklift licence', 'Inventory systems'],
  },
  {
    firstName: 'Vikram',
    lastName: 'Rao',
    title: 'Forklift Driver',
    years: 7,
    skills: ['Forklift licence', 'Reach truck'],
  },
  {
    firstName: 'Samuel',
    lastName: 'Owusu',
    title: 'Logistics Assistant',
    years: 2,
    skills: ['Inventory systems'],
  },
  {
    firstName: 'Imran',
    lastName: 'Qureshi',
    title: 'Electrician',
    years: 9,
    skills: ['LV wiring', 'DEWA approval'],
  },
  {
    firstName: 'Marco',
    lastName: 'Silva',
    title: 'Site Electrician',
    years: 4,
    skills: ['LV wiring', 'Cable pulling'],
  },
  {
    firstName: 'Ahmed',
    lastName: 'Nasser',
    title: 'Electrical Technician',
    years: 3,
    skills: ['Panel maintenance'],
  },
  {
    firstName: 'Grace',
    lastName: 'Achieng',
    title: 'Registered Nurse',
    years: 6,
    skills: ['DHA licence', 'ICU'],
  },
  {
    firstName: 'Maria',
    lastName: 'Santos',
    title: 'Staff Nurse',
    years: 4,
    skills: ['DHA licence', 'Paediatrics'],
  },
  { firstName: 'Leila', lastName: 'Karimi', title: 'Nurse', years: 2, skills: ['BLS'] },
  {
    firstName: 'Tomas',
    lastName: 'Novak',
    title: 'Warehouse Supervisor',
    years: 10,
    skills: ['Forklift licence', 'Team leadership'],
  },
] as const;

/** stage path per candidate index, e.g. 'SHORTLISTED' walks APPLIED → SCREENING → SHORTLISTED. */
const DEMO_PIPELINE: {
  roleTitle: string;
  skills: { name: string; minYears?: number }[];
  candidates: [number, string][];
}[] = [
  {
    roleTitle: 'Forklift Operator',
    skills: [{ name: 'Forklift licence', minYears: 2 }],
    candidates: [
      [0, 'INTERVIEW'],
      [1, 'SHORTLISTED'],
      [2, 'APPLIED'],
      [9, 'SCREENING'],
    ],
  },
  {
    roleTitle: 'Site Electrician',
    skills: [{ name: 'LV wiring', minYears: 3 }, { name: 'DEWA approval' }],
    candidates: [
      [3, 'OFFER'],
      [4, 'SCREENING'],
      [5, 'REJECTED'],
    ],
  },
  {
    roleTitle: 'Registered Nurse',
    skills: [{ name: 'DHA licence', minYears: 2 }],
    candidates: [
      [6, 'SHORTLISTED'],
      [7, 'APPLIED'],
      [8, 'APPLIED'],
    ],
  },
];

const FORWARD = ['APPLIED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'OFFER'] as const;

/** Open jobs on the approved demo requests with candidates spread across the pipeline. */
export async function seedDemoRecruitment(prisma: PrismaClient): Promise<void> {
  const hr = await prisma.user.findUniqueOrThrow({ where: { email: 'hr@staffos.demo' } });
  const recruiter = await prisma.user.findUniqueOrThrow({
    where: { email: 'recruiter@staffos.demo' },
  });
  const hm = await prisma.user.findUniqueOrThrow({ where: { email: 'hm@staffos.demo' } });
  const day = 86_400_000;

  const candidates = [];
  for (const c of DEMO_CANDIDATES) {
    const email = `${c.firstName}.${c.lastName}@candidates.example`.toLowerCase();
    candidates.push(
      (await prisma.candidate.findFirst({ where: { email } })) ??
        (await prisma.candidate.create({
          data: {
            firstName: c.firstName,
            lastName: c.lastName,
            email,
            currentTitle: c.title,
            totalExperienceMonths: c.years * 12,
            location: 'Dubai',
            source: 'MANUAL',
            languages: ['English'],
            createdById: recruiter.id,
            skills: { create: c.skills.map((name) => ({ name, years: Math.min(c.years, 5) })) },
          },
        })),
    );
  }

  for (const [index, plan] of DEMO_PIPELINE.entries()) {
    const request = await prisma.manpowerRequest.findFirst({
      where: { roleTitle: plan.roleTitle, status: 'APPROVED' },
    });
    if (!request || (await prisma.job.count({ where: { manpowerRequestId: request.id } })) > 0)
      continue;
    const publishedAt = new Date(Date.now() - (20 + index * 5) * day);
    const job = await prisma.job.create({
      data: {
        manpowerRequestId: request.id,
        clientId: request.clientId,
        title: request.roleTitle,
        slug: `${request.roleTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-demo${index}`,
        description: `We are hiring ${request.headcount} ${request.roleTitle.toLowerCase()}s for a long-term project in ${request.location}.`,
        category: request.category,
        location: request.location,
        emirate: request.emirate,
        headcount: request.headcount,
        status: 'OPEN',
        publishedAt,
        hiringManagerId: hm.id,
        createdById: hr.id,
        recruiters: { create: [{ userId: recruiter.id }] },
        skills: {
          create: plan.skills.map((s) => ({
            name: s.name,
            weight: 'MUST' as const,
            minYears: s.minYears,
          })),
        },
      },
    });

    for (const [candidateIndex, target] of plan.candidates) {
      const rejected = target === 'REJECTED';
      const path = rejected
        ? ['APPLIED', 'SCREENING']
        : FORWARD.slice(0, FORWARD.indexOf(target as (typeof FORWARD)[number]) + 1);
      const stages = rejected ? [...path, 'REJECTED'] : path;
      // Spread history over the days since publishing so time-in-stage looks realistic.
      const at = (i: number) => new Date(publishedAt.getTime() + (i * 3 + 1) * day);
      const app = await prisma.application.create({
        data: {
          candidateId: candidates[candidateIndex]!.id,
          jobId: job.id,
          stage: stages.at(-1) as 'APPLIED',
          version: stages.length,
          appliedAt: at(0),
          stageChangedAt: at(stages.length - 1),
          rejectReason: rejected ? 'Missing DEWA approval' : null,
          createdById: recruiter.id,
        },
      });
      await prisma.applicationStageHistory.createMany({
        data: stages.map((toStage, i) => ({
          applicationId: app.id,
          fromStage: i === 0 ? null : (stages[i - 1] as 'APPLIED'),
          toStage: toStage as 'APPLIED',
          reason: toStage === 'REJECTED' ? 'Missing DEWA approval' : null,
          changedById: recruiter.id,
          changedAt: at(i),
        })),
      });
    }
  }
}

/**
 * Interviews for demo candidates in the Interview stage and pending offers for those in Offer,
 * so the application pages and the hiring manager's queue have content. Idempotent.
 */
export async function seedDemoHiring(prisma: PrismaClient): Promise<void> {
  const recruiter = await prisma.user.findUniqueOrThrow({
    where: { email: 'recruiter@staffos.demo' },
  });
  const hm = await prisma.user.findUniqueOrThrow({ where: { email: 'hm@staffos.demo' } });
  const demoJobs = { slug: { contains: '-demo' } };

  const interviewing = await prisma.application.findMany({
    where: { stage: 'INTERVIEW', job: demoJobs, interviews: { none: {} } },
  });
  for (const [i, app] of interviewing.entries()) {
    // 10:00 Dubai time (06:00 UTC), spread over the coming days.
    const when = new Date();
    when.setUTCDate(when.getUTCDate() + 2 + i);
    when.setUTCHours(6, 0, 0, 0);
    await prisma.interview.create({
      data: {
        applicationId: app.id,
        scheduledAt: when,
        durationMin: 45,
        mode: i % 2 ? 'VIDEO' : 'ONSITE',
        location: i % 2 ? null : 'StaffOS office, Business Bay',
        meetingUrl: i % 2 ? 'https://meet.example.test/staffos-demo' : null,
        createdById: recruiter.id,
        interviewers: { create: [{ userId: hm.id }] },
      },
    });
  }

  const offering = await prisma.application.findMany({
    where: { stage: 'OFFER', job: demoJobs, offers: { none: {} } },
  });
  for (const app of offering) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 30);
    await prisma.offer.create({
      data: {
        applicationId: app.id,
        salaryFils: 550_000,
        startDate: new Date(start.toISOString().slice(0, 10)),
        contractType: 'FIXED_TERM',
        contractMonths: 24,
        notes: 'Includes shared accommodation and transport.',
        createdById: recruiter.id,
      },
    });
  }
}
