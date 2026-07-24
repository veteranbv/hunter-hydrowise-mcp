import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConfigError } from '../errors.js';
import type { HydrawiseApi } from '../hydrawise/api.js';
import type { Logger } from '../logger.js';
import { pickSuspendUntil, previewOrApply, resolveUntil, runTool } from './_helpers.js';

const PreviewInput = { preview: z.boolean().optional() };

const StartZoneInput = {
  zone_id: z.number().int(),
  minutes: z.number().int().min(0).optional(),
  learn_current_from_next_run: z.boolean().optional(),
  learn_flow_from_next_run: z.boolean().optional(),
  ...PreviewInput,
};

const StopZoneInput = { zone_id: z.number().int(), ...PreviewInput };

const StartAllZonesInput = {
  controller_id: z.number().int(),
  minutes: z.number().int().min(0).optional(),
  learn_current_from_next_run: z.boolean().optional(),
  learn_flow_from_next_run: z.boolean().optional(),
  ...PreviewInput,
};

const StopAllZonesInput = { controller_id: z.number().int(), ...PreviewInput };

const SuspendZoneInput = {
  zone_id: z.number().int(),
  days: z.number().int().min(1).optional(),
  until: z.string().optional(),
  ...PreviewInput,
};

const ResumeZoneInput = { zone_id: z.number().int(), ...PreviewInput };

const SuspendAllZonesInput = {
  controller_id: z.number().int(),
  days: z.number().int().min(1).optional(),
  until: z.string().optional(),
  ...PreviewInput,
};

const ResumeAllZonesInput = { controller_id: z.number().int(), ...PreviewInput };

const RunProgramInput = {
  program_id: z.number().int(),
  mark_run_as_scheduled: z.boolean().describe(
    'Required by the mutation (Boolean!). true records this as a scheduled run for the program; false runs it as an extra manual run.',
  ),
  minutes: z.number().int().min(1).optional().describe(
    'Per-zone run length override, in minutes. Omit to use each zone\'s configured length.',
  ),
  learn_current_from_next_run: z.boolean().optional(),
  learn_flow_from_next_run: z.boolean().optional(),
  ...PreviewInput,
};

const RunProgramStartTimeInput = {
  program_start_time_id: z.number().int(),
  mark_run_as_scheduled: z.boolean().describe(
    'Required by the mutation (Boolean!). true records this as a scheduled run; false runs it as an extra manual run.',
  ),
  minutes: z.number().int().min(1).optional().describe(
    'Per-zone run length override, in minutes. Omit to use each zone\'s configured length.',
  ),
  learn_current_from_next_run: z.boolean().optional(),
  learn_flow_from_next_run: z.boolean().optional(),
  ...PreviewInput,
};

const RunSelectedZonesInput = {
  zone_ids: z.array(z.number().int()).min(1),
  minutes: z.array(z.number().int().min(1)).min(1).describe(
    'Run length per zone, in minutes, positionally matched to zone_ids. Must be the same length as zone_ids.',
  ),
  mark_run_as_scheduled: z.boolean().optional(),
  stack_runs: z.boolean().optional().describe(
    'Queue behind any in-progress run (default true), matching start_zone.',
  ),
  learn_current_from_next_run: z.boolean().optional(),
  learn_flow_from_next_run: z.boolean().optional(),
  ...PreviewInput,
};

const CancelZoneRunsInput = { zone_id: z.number().int(), ...PreviewInput };

const PHYSICAL = 'PHYSICAL ACTION:';

export function registerControlTools(server: McpServer, api: HydrawiseApi, logger?: Logger): void {
  const wrap = (toolName: string, fn: () => ReturnType<typeof previewOrApply>) =>
    runTool(fn, { logger, toolName });

  server.registerTool(
    'start_zone',
    {
      description: `${PHYSICAL} starts watering on a single zone. Optional 'minutes' (default: zone's configured run length). New runs are stacked behind any in-progress run. Optional 'learn_current_from_next_run' / 'learn_flow_from_next_run' tell the controller to observe and remember the zone's electrical current / water flow during this run. Pass \`preview: true\` to dry-run.`,
      inputSchema: StartZoneInput,
    },
    async ({ zone_id, minutes, learn_current_from_next_run, learn_flow_from_next_run, preview }) =>
      wrap('start_zone', async () => {
        const seconds = minutes && minutes > 0 ? minutes * 60 : 0;
        const variables = {
          zoneId: zone_id,
          markRunAsScheduled: false,
          stackRuns: true,
          customRunDuration: seconds > 0 ? seconds : null,
          learnCurrentFromNextRun: learn_current_from_next_run ?? null,
          learnFlowFromNextRun: learn_flow_from_next_run ?? null,
        };
        return previewOrApply('startZone', variables, preview, async () =>
          api.startZone(zone_id, {
            durationSeconds: seconds,
            learnCurrentFromNextRun: learn_current_from_next_run,
            learnFlowFromNextRun: learn_flow_from_next_run,
          }),
        );
      }),
  );

  server.registerTool(
    'run_program',
    {
      description: `${PHYSICAL} runs every zone attached to a program, as one program run. Use this instead of calling start_zone per zone when the intent is "run the Lawn program now". 'mark_run_as_scheduled' is required by the API: true records the run against the program's schedule, false runs it as an extra manual run. Optional 'minutes' overrides each zone's configured run length. Zones run sequentially, not all at once (verified on hardware). Pass \`preview: true\` to dry-run.`,
      inputSchema: RunProgramInput,
    },
    async ({ program_id, mark_run_as_scheduled, minutes, learn_current_from_next_run, learn_flow_from_next_run, preview }) =>
      wrap('run_program', async () => {
        const seconds = minutes ? minutes * 60 : undefined;
        const variables = {
          programId: program_id,
          markRunAsScheduled: mark_run_as_scheduled,
          customDuration: seconds ?? null,
          learnCurrentFromNextRun: learn_current_from_next_run ?? null,
          learnFlowFromNextRun: learn_flow_from_next_run ?? null,
        };
        return previewOrApply('startZonesWithProgram', variables, preview, async () =>
          api.startZonesWithProgram(program_id, mark_run_as_scheduled, {
            customDurationSeconds: seconds,
            learnCurrentFromNextRun: learn_current_from_next_run,
            learnFlowFromNextRun: learn_flow_from_next_run,
          }),
        );
      }),
  );

  server.registerTool(
    'run_program_start_time',
    {
      description: `${PHYSICAL} runs the zones attached to a single program start time, rather than the whole program. Same 'mark_run_as_scheduled' and 'minutes' semantics as run_program. Pass \`preview: true\` to dry-run.`,
      inputSchema: RunProgramStartTimeInput,
    },
    async ({ program_start_time_id, mark_run_as_scheduled, minutes, learn_current_from_next_run, learn_flow_from_next_run, preview }) =>
      wrap('run_program_start_time', async () => {
        const seconds = minutes ? minutes * 60 : undefined;
        const variables = {
          programStartTimeId: program_start_time_id,
          markRunAsScheduled: mark_run_as_scheduled,
          customDuration: seconds ?? null,
          learnCurrentFromNextRun: learn_current_from_next_run ?? null,
          learnFlowFromNextRun: learn_flow_from_next_run ?? null,
        };
        return previewOrApply('startZonesWithProgramStartTime', variables, preview, async () =>
          api.startZonesWithProgramStartTime(program_start_time_id, mark_run_as_scheduled, {
            customDurationSeconds: seconds,
            learnCurrentFromNextRun: learn_current_from_next_run,
            learnFlowFromNextRun: learn_flow_from_next_run,
          }),
        );
      }),
  );

  server.registerTool(
    'run_selected_zones',
    {
      description: `${PHYSICAL} runs a chosen set of zones, each with its own run length. 'minutes' is positionally matched to 'zone_ids' and must be the same length. Use start_zone for a single zone and run_program when the intent is a whole program. Pass \`preview: true\` to dry-run.`,
      inputSchema: RunSelectedZonesInput,
    },
    async ({ zone_ids, minutes, mark_run_as_scheduled, stack_runs, learn_current_from_next_run, learn_flow_from_next_run, preview }) =>
      wrap('run_selected_zones', async () => {
        // Parallel-array contract: a length mismatch is caller error. Reject it
        // here rather than letting Hydrawise pair them by position and silently
        // drop the extras.
        if (zone_ids.length !== minutes.length) {
          throw new ConfigError(
            `zone_ids and minutes must be the same length (got ${zone_ids.length} zone_ids, ${minutes.length} minutes)`,
          );
        }
        const runDurations = minutes.map((m) => m * 60);
        const variables = {
          zoneIds: zone_ids,
          runDurations,
          markRunAsScheduled: mark_run_as_scheduled ?? false,
          stackRuns: stack_runs ?? true,
          learnCurrentFromNextRun: learn_current_from_next_run ?? null,
          learnFlowFromNextRun: learn_flow_from_next_run ?? null,
        };
        return previewOrApply('startSelectedZones', variables, preview, async () =>
          api.startSelectedZones(zone_ids, runDurations, {
            markRunAsScheduled: mark_run_as_scheduled,
            stackRuns: stack_runs,
            learnCurrentFromNextRun: learn_current_from_next_run,
            learnFlowFromNextRun: learn_flow_from_next_run,
          }),
        );
      }),
  );

  server.registerTool(
    'cancel_zone_runs',
    {
      description: `${PHYSICAL} cancels the in-progress run AND any queued runs for a zone. stop_zone only stops the run that is currently active. Pass \`preview: true\` to dry-run.`,
      inputSchema: CancelZoneRunsInput,
    },
    async ({ zone_id, preview }) =>
      wrap('cancel_zone_runs', async () =>
        previewOrApply('cancelRunsForZone', { zoneId: zone_id }, preview, async () =>
          api.cancelRunsForZone(zone_id),
        ),
      ),
  );

  server.registerTool(
    'stop_zone',
    {
      description: `${PHYSICAL} stops any in-progress run on a single zone. Pass \`preview: true\` to dry-run.`,
      inputSchema: StopZoneInput,
    },
    async ({ zone_id, preview }) =>
      wrap('stop_zone', async () =>
        previewOrApply('stopZone', { zoneId: zone_id }, preview, async () => api.stopZone(zone_id)),
      ),
  );

  server.registerTool(
    'start_all_zones',
    {
      description: `${PHYSICAL} starts every zone on the given controller. Optional 'minutes' applies to every zone (default: each zone's configured run length). Optional 'learn_current_from_next_run' / 'learn_flow_from_next_run' tell the controller to observe and remember per-zone electrical current / water flow during this run. Pass \`preview: true\` to dry-run.`,
      inputSchema: StartAllZonesInput,
    },
    async ({ controller_id, minutes, learn_current_from_next_run, learn_flow_from_next_run, preview }) =>
      wrap('start_all_zones', async () => {
        const seconds = minutes && minutes > 0 ? minutes * 60 : 0;
        const variables = {
          controllerId: controller_id,
          markRunAsScheduled: false,
          customRunDuration: seconds > 0 ? seconds : null,
          learnCurrentFromNextRun: learn_current_from_next_run ?? null,
          learnFlowFromNextRun: learn_flow_from_next_run ?? null,
        };
        return previewOrApply('startAllZones', variables, preview, async () =>
          api.startAllZones(controller_id, {
            durationSeconds: seconds,
            learnCurrentFromNextRun: learn_current_from_next_run,
            learnFlowFromNextRun: learn_flow_from_next_run,
          }),
        );
      }),
  );

  server.registerTool(
    'stop_all_zones',
    {
      description: `${PHYSICAL} stops any in-progress run on every zone of the given controller. Pass \`preview: true\` to dry-run.`,
      inputSchema: StopAllZonesInput,
    },
    async ({ controller_id, preview }) =>
      wrap('stop_all_zones', async () =>
        previewOrApply('stopAllZones', { controllerId: controller_id }, preview, async () =>
          api.stopAllZones(controller_id),
        ),
      ),
  );

  server.registerTool(
    'suspend_zone',
    {
      description: `${PHYSICAL} suspends the schedule for a single zone. Provide exactly one of 'days' (relative, days from now) or 'until' (absolute ISO-8601 timestamp). Pass \`preview: true\` to dry-run.`,
      inputSchema: SuspendZoneInput,
    },
    async ({ zone_id, days, until, preview }) =>
      wrap('suspend_zone', async () => {
        const target = resolveUntil(pickSuspendUntil(days, until));
        return previewOrApply(
          'suspendZone',
          { zoneId: zone_id, until: target.toISOString() },
          preview,
          async () => api.suspendZone(zone_id, target),
        );
      }),
  );

  server.registerTool(
    'resume_zone',
    {
      description: `${PHYSICAL} clears any active suspension on a single zone. Pass \`preview: true\` to dry-run.`,
      inputSchema: ResumeZoneInput,
    },
    async ({ zone_id, preview }) =>
      wrap('resume_zone', async () =>
        previewOrApply('resumeZone', { zoneId: zone_id }, preview, async () =>
          api.resumeZone(zone_id),
        ),
      ),
  );

  server.registerTool(
    'suspend_all_zones',
    {
      description: `${PHYSICAL} suspends every zone on the given controller. Provide exactly one of 'days' or 'until'. Pass \`preview: true\` to dry-run.`,
      inputSchema: SuspendAllZonesInput,
    },
    async ({ controller_id, days, until, preview }) =>
      wrap('suspend_all_zones', async () => {
        const target = resolveUntil(pickSuspendUntil(days, until));
        return previewOrApply(
          'suspendAllZones',
          { controllerId: controller_id, until: target.toISOString() },
          preview,
          async () => api.suspendAllZones(controller_id, target),
        );
      }),
  );

  server.registerTool(
    'resume_all_zones',
    {
      description: `${PHYSICAL} clears any active suspension on every zone of the given controller. Pass \`preview: true\` to dry-run.`,
      inputSchema: ResumeAllZonesInput,
    },
    async ({ controller_id, preview }) =>
      wrap('resume_all_zones', async () =>
        previewOrApply('resumeAllZones', { controllerId: controller_id }, preview, async () =>
          api.resumeAllZones(controller_id),
        ),
      ),
  );
}
