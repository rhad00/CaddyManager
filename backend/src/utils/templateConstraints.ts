/**
 * Proxy options a template cannot work with. A constrained option is forced off: the proxy form
 * greys it out, and applying the template resets it, so the API cannot produce a combination
 * whose behaviour is unknown.
 *
 * Keyed by template name: only the templates that ship with CaddyManager have constraints.
 * Analysis of the shipped templates: only Amazon S3 conflicts with a proxy option. The others
 * only add request headers or a redirect/rate limit, which work with every option.
 */
export type ConstrainedOption = 'compression_enabled' | 'basic_auth';

export interface TemplateConstraint {
  option: ConstrainedOption;
  /** The only value the option may have with this template */
  value: false;
  reason: string;
}

const S3_CONSTRAINTS: readonly TemplateConstraint[] = [
  {
    option: 'compression_enabled',
    value: false,
    reason: 'Compression changes the body (ETag) and the Content-Length of HEAD responses, which breaks S3 SDK checksums.',
  },
  {
    option: 'basic_auth',
    value: false,
    reason: 'Basic auth consumes the Authorization header, which carries the SigV4 signature of every S3 request.',
  },
];

const TEMPLATE_CONSTRAINTS: Readonly<Record<string, readonly TemplateConstraint[]>> = {
  'Amazon S3': S3_CONSTRAINTS,
};

export function constraintsFor(templateName: string | null | undefined): TemplateConstraint[] {
  if (!templateName || !Object.hasOwn(TEMPLATE_CONSTRAINTS, templateName)) return [];
  return [...TEMPLATE_CONSTRAINTS[templateName]];
}

export function lockedOptions(templateName: string | null | undefined): ConstrainedOption[] {
  return constraintsFor(templateName).map((c) => c.option);
}

/** Proxy field values that satisfy the constraints of the template (`basic_auth` is cleared with null) */
export function forcedProxyValues(templateName: string | null | undefined): { compression_enabled?: false; basic_auth?: null } {
  const values: { compression_enabled?: false; basic_auth?: null } = {};
  for (const { option } of constraintsFor(templateName)) {
    if (option === 'basic_auth') values.basic_auth = null;
    else values.compression_enabled = false;
  }
  return values;
}
