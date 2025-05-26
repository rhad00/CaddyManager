import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { FormInput, FormSelect, FormField } from './Form';
import { Download, Plus, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DomainConfig } from '../../validations/proxySchema';
import { cn } from '../../utils/cn';

interface DomainFieldsProps {
  name: string;
  onError?: (error: string) => void;
}

const SSL_OPTIONS = [
  { value: 'acme', label: "ACME (Let's Encrypt)", description: "Automatically obtain and manage SSL certificates" },
  { value: 'custom', label: 'Custom Certificate', description: "Use your own SSL certificate and private key" },
  { value: 'none', label: 'No SSL', description: "Serve traffic over HTTP only (not recommended for production)" },
] as const;

export default function DomainFields({ name, onError }: DomainFieldsProps) {
  const { control, setError, clearErrors } = useFormContext();
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name,
  });

  const [isDragging, setIsDragging] = useState(false);
  const domains = useWatch({ name, control });
  const sslTypes = useWatch({
    name: fields.map((_, index) => `${name}.${index}.ssl_type`),
    control,
  });

  // Validate domains for duplicates
  useEffect(() => {
    const duplicates = domains?.reduce((acc: string[], domain: DomainConfig, idx: number) => {
      const duplicateIdx = domains.findIndex(
        (d: DomainConfig, i: number) =>
          i !== idx && d.name.toLowerCase() === domain.name.toLowerCase(),
      );
      if (duplicateIdx !== -1) acc.push(domain.name);
      return acc;
    }, []);

    if (duplicates?.length) {
      const error = `Duplicate domains found: ${duplicates.join(', ')}`;
      setError(name, { type: 'duplicate', message: error });
      onError?.(error);
    } else {
      clearErrors(name);
    }
  }, [domains, name, setError, clearErrors, onError]);

  // Handle bulk import
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const content = e.target?.result as string;
            const domains = content
              .split('\n')
              .map(line => line.trim())
              .filter(line => line && !line.startsWith('#'))
              .map(domain => ({
                name: domain,
                ssl_type: 'acme' as const,
              }));
            replace(domains);
          } catch (err) {
            onError?.('Failed to import domains: Invalid format');
          }
        };
        reader.readAsText(file);
      }
    },
    [replace, onError],
  );

  // Handle bulk export
  const handleExport = useCallback(() => {
    const content = domains.map((d: DomainConfig) => d.name).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'domains.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [domains]);

  return (
    <div
      className={cn(
        'space-y-4 rounded-lg border-2 border-dashed p-4',
        isDragging ? 'border-primary bg-primary/5' : 'border-muted',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="group"
      aria-label="Domain configurations"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium">Domains</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={!fields.length}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary disabled:opacity-50"
            title="Export domains"
          >
            <Download size={16} />
            Export
          </button>
          <button
            type="button"
            onClick={() => document.getElementById('domain-import')?.click()}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
            title="Import domains"
          >
            <Upload size={16} />
            Import
          </button>
          <input
            id="domain-import"
            type="file"
            accept=".txt"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = e => {
                  try {
                    const content = e.target?.result as string;
                    const domains = content
                      .split('\n')
                      .map(line => line.trim())
                      .filter(line => line && !line.startsWith('#'))
                      .map(domain => ({
                        name: domain,
                        ssl_type: 'acme' as const,
                      }));
                    replace(domains);
                  } catch (err) {
                    onError?.('Failed to import domains: Invalid format');
                  }
                };
                reader.readAsText(file);
              }
            }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="flex items-start gap-4 p-4 rounded-lg border border-input"
            role="group"
            aria-label={`Domain ${index + 1} configuration`}
          >
            <div className="flex-1 space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <FormField
                    name={`${name}.${index}.name`}
                    label="Domain Name"
                    helperText="Enter a hostname (e.g., api.example.com) or wildcard domain (e.g., *.example.com)"
                  >
                    <FormInput
                      name={`${name}.${index}.name`}
                      placeholder="example.com"
                      aria-label={`Domain ${index + 1} name`}
                    />
                  </FormField>
                </div>
                <div className="w-48">
                  <FormField
                    name={`${name}.${index}.ssl_type`}
                    label="SSL Type"
                    helperText={SSL_OPTIONS.find(opt => opt.value === sslTypes?.[index])?.description}
                  >
                    <FormSelect
                      name={`${name}.${index}.ssl_type`}
                      options={SSL_OPTIONS}
                      aria-label={`SSL type for domain ${index + 1}`}
                    />
                  </FormField>
                </div>
              </div>

              {sslTypes?.[index] === 'custom' && (
                <div className="flex gap-4">
                  <div className="flex-1">
                    <FormField
                      name={`${name}.${index}.custom_cert_path`}
                      label="Certificate Path"
                      helperText="Path to your SSL certificate file (.pem or .crt)"
                    >
                      <FormInput
                        name={`${name}.${index}.custom_cert_path`}
                        placeholder="/path/to/cert.pem"
                      />
                    </FormField>
                  </div>
                  <div className="flex-1">
                    <FormField
                      name={`${name}.${index}.custom_key_path`}
                      label="Private Key Path"
                      helperText="Path to your SSL private key file (.pem or .key)"
                    >
                      <FormInput
                        name={`${name}.${index}.custom_key_path`}
                        placeholder="/path/to/key.pem"
                      />
                    </FormField>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(index)}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label={`Remove domain ${index + 1}`}
              title="Remove domain"
            >
              <X size={16} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => append({ name: '', ssl_type: 'acme' })}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
          aria-label="Add new domain"
        >
          <Plus size={16} aria-hidden="true" />
          Add Domain
        </button>

        {!fields.length && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Drag and drop a text file or click Import to bulk add domains
          </p>
        )}
      </div>
    </div>
  );
}

export type { DomainFieldsProps };
