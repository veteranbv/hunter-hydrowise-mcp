#!/usr/bin/env tsx
// Quick probe to introspect what each WateringProgramAdjustment ID actually
// configures on the live account. Surfaces the labels for the opaque integer
// ids that appear in schedule_adjustment_ids on programs.
//
// Run: HYDRAWISE_USERNAME=... HYDRAWISE_PASSWORD=... npx tsx scripts/probe-adjustments.ts
// Optionally set HYDRAWISE_PROBE_CONTROLLER_ID to target a specific controller;
// defaults to the first controller on the account.
import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { Auth } from '../src/hydrawise/auth.js';
import { GraphQLClient } from 'graphql-request';

async function main() {
  const config = loadConfig();
  const auth = new Auth(config.username, config.password);
  const authHeader = await auth.getAuthHeader();

  const client = new GraphQLClient('https://app.hydrawise.com/api/v2/graph', {
    headers: { Authorization: authHeader },
  });

  const envControllerId = process.env.HYDRAWISE_PROBE_CONTROLLER_ID
    ? Number.parseInt(process.env.HYDRAWISE_PROBE_CONTROLLER_ID, 10)
    : null;

  // Field is on individual program types (not on Controller). Ask each Standard
  // program for its conditionalWateringAdjustments. Semantics verified live on
  // two accounts (2026-07-24) plus the clear-then-read experiment in issue #11:
  // the field returns the adjustments currently ATTACHED to the program, not an
  // account-wide catalog of available adjustments (no such read path exists —
  // scheduleAdjustmentIds is write-only in the schema). isContractor only
  // switches label wording: false → account-parameterized labels ("0.3in+
  // rainfall last day"), true → generic contractor labels ("High rainfall
  // last day").
  const query = `
    query ProbeAdjustments($controllerId: Int!) {
      me {
        controllers {
          id
          name
          programs(includeZoneSpecific: false) {
            __typename
            id
            name
            ... on StandardProgram {
              conditionalWateringAdjustments(controllerId: $controllerId, isContractor: false) {
                id
                label
                applicableSchedulingMethod {
                  value
                  label
                }
              }
            }
          }
        }
      }
    }
  `;

  // Resolve the target controller: env override, else the first on the account.
  const controllersResult = await client.request<{
    me: { controllers: { id: number; name: string }[] };
  }>(`query { me { controllers { id name } } }`);
  const controllers = controllersResult.me.controllers;
  if (controllers.length === 0) {
    console.error('No controllers on this account.');
    process.exit(1);
  }
  const target = envControllerId
    ? controllers.find((c) => c.id === envControllerId)
    : controllers[0];
  if (!target) {
    console.error(`Controller ${envControllerId} not found on this account.`);
    process.exit(1);
  }

  const result = await client.request<{
    me: {
      controllers: {
        id: number;
        name: string;
        programs: {
          __typename: string;
          id: number;
          name: string;
          conditionalWateringAdjustments?: {
            id: number;
            label: string;
            applicableSchedulingMethod: { value: number | null; label: string | null };
          }[];
        }[];
      }[];
    };
  }>(query, { controllerId: target.id });

  for (const controller of result.me.controllers) {
    if (controller.id !== target.id) continue;
    console.log(`\nController: ${controller.name} (id ${controller.id})\n`);

    let any = false;
    for (const p of controller.programs) {
      if (p.__typename !== 'StandardProgram') continue;
      any = true;
      const attached = p.conditionalWateringAdjustments ?? [];
      console.log(`Program "${p.name}" (id ${p.id}) — attached adjustments:`);
      if (attached.length === 0) {
        console.log('  (none attached)');
      }
      for (const adj of attached) {
        console.log(
          `  id=${adj.id}  label="${adj.label}"  scheduling_method=${adj.applicableSchedulingMethod.value} (${adj.applicableSchedulingMethod.label})`,
        );
      }
    }
    if (!any) {
      console.log('No Standard programs on this controller.');
    }
    console.log(
      '\nThese are the adjustments currently ATTACHED per program (not an account catalog).',
    );
    console.log('Match ids against schedule_adjustment_ids from get_program / snapshots.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
