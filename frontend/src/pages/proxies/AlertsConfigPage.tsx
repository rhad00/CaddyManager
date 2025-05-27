import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProxy } from '../../services/proxyService';
import Spinner from '../../components/ui/Spinner';
import { AlertType, AlertSeverity } from '../../types/alerts';
import { Form, FormField, FormInput, FormSubmit, FormSelect, FormSwitch } from '../../components/ui/Form';
import { useForm, FormProvider } from 'react-hook-form';
import { useToast } from '../../components/ui/Toast';

interface AlertThresholdForm {
  name: string;
  type: AlertType;
  severity: AlertSeverity;
  conditions: {
    operator: '>' | '<' | '==' | '>=' | '<=';
    value: number;
    duration?: number;
    frequency?: number;
  };
  notifications: {
    type: 'email' | 'slack';
    config: {
      recipients?: string[];
      webhook?: string;
      channel?: string;
    };
    enabled: boolean;
  }[];
}

export default function AlertsConfigPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: proxy, isLoading, error } = useProxy(id!);
  const { toast } = useToast();
  const [selectedThreshold, setSelectedThreshold] = useState<string | null>(null);

  const form = useForm<AlertThresholdForm>({
    defaultValues: {
      name: '',
      type: AlertType.METRIC_THRESHOLD,
      severity: AlertSeverity.WARNING,
      conditions: {
        operator: '>',
        value: 0,
      },
      notifications: [
        {
          type: 'email',
          config: {
            recipients: [],
          },
          enabled: true,
        },
      ],
    },
  });

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  if (error || !proxy) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center text-destructive">
          <h2 className="text-lg font-semibold">Error Loading Proxy</h2>
          <p className="text-sm">The proxy alerts configuration could not be loaded.</p>
        </div>
      </div>
    );
  }

  const onSubmit = async (data: AlertThresholdForm) => {
    try {
      // TODO: Implement alert threshold creation/update
      toast('Alert configuration saved successfully', 'success');
    } catch (error) {
      toast(
        `Failed to save alert configuration: ${
          error instanceof Error ? error.message : 'Unknown error occurred'
        }`,
        'error',
      );
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Alert Configuration</h1>
          <p className="text-muted-foreground">Configure alerts for {proxy.name}</p>
        </div>
        <button
          onClick={() => navigate(`/proxies/${id}`)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to Proxy
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Alert List */}
        <div className="col-span-4 bg-card rounded-lg p-6 shadow">
          <h2 className="text-lg font-semibold mb-4">Alert Thresholds</h2>
          <div className="space-y-4">
            <button
              onClick={() => setSelectedThreshold(null)}
              className="w-full px-4 py-3 text-left bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              + Add Alert Threshold
            </button>
            {/* TODO: List existing alert thresholds */}
          </div>
        </div>

        {/* Alert Form */}
        <div className="col-span-8 bg-card rounded-lg p-6 shadow">
          <FormProvider {...form}>
            <Form form={form} onSubmit={onSubmit}>
              <FormField
                name="name"
                label="Alert Name"
                helperText="A descriptive name for this alert"
              >
                <FormInput type="text" name="name" placeholder="High Response Time" />
              </FormField>

              <FormField
                name="type"
                label="Alert Type"
                helperText="The type of condition to monitor"
              >
                <FormSelect 
                  name="type"
                  options={Object.entries(AlertType).map(([key, value]) => ({
                    value,
                    label: key.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ')
                  }))}
                />
              </FormField>

              <FormField
                name="severity"
                label="Severity"
                helperText="How critical is this alert"
              >
                <FormSelect 
                  name="severity"
                  options={Object.entries(AlertSeverity).map(([key, value]) => ({
                    value,
                    label: key.charAt(0) + key.slice(1).toLowerCase()
                  }))}
                />
              </FormField>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Conditions</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField name="conditions.operator" label="Operator">
                    <FormSelect 
                      name="conditions.operator"
                      options={[
                        { value: '>', label: '>' },
                        { value: '>=', label: '>=' },
                        { value: '<', label: '<' },
                        { value: '<=', label: '<=' },
                        { value: '==', label: '=' }
                      ]}
                    />
                  </FormField>

                  <FormField name="conditions.value" label="Value">
                    <FormInput type="number" name="conditions.value" />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    name="conditions.duration"
                    label="Duration (seconds)"
                    helperText="How long the condition must be true"
                  >
                    <FormInput type="number" name="conditions.duration" />
                  </FormField>

                  <FormField
                    name="conditions.frequency"
                    label="Frequency (seconds)"
                    helperText="Minimum time between alerts"
                  >
                    <FormInput type="number" name="conditions.frequency" />
                  </FormField>
                </div>
              </div>

              <div className="space-y-4 mt-6">
                <h3 className="text-lg font-semibold">Notifications</h3>
                <div className="space-y-6">
                  {form.watch('notifications').map((notification, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-center mb-4">
                        <FormField name={`notifications.${index}.enabled`} label="Enable">
                          <FormSwitch name={`notifications.${index}.enabled`} />
                        </FormField>
                        <button
                          type="button"
                          onClick={() => {
                            const notifications = form.getValues('notifications').filter((_, i) => i !== index);
                            form.setValue('notifications', notifications);
                          }}
                          className="text-sm text-destructive hover:text-destructive/80"
                        >
                          Remove
                        </button>
                      </div>

                      <FormField name={`notifications.${index}.type`} label="Type">
                        <FormSelect
                          name={`notifications.${index}.type`}
                          options={[
                            { value: 'email', label: 'Email' },
                            { value: 'slack', label: 'Slack' }
                          ]}
                          onChange={(e) => {
                            const type = e.target.value as 'email' | 'slack';
                            const notifications = [...form.getValues('notifications')];
                            notifications[index] = {
                              type,
                              config: type === 'email' ? { recipients: [] } : { webhook: '' },
                              enabled: true,
                            };
                            form.setValue('notifications', notifications);
                          }}
                        />
                      </FormField>

                      {notification.type === 'email' && (
                        <FormField
                          name={`notifications.${index}.config.recipients`}
                          label="Recipients"
                          helperText="Comma-separated email addresses"
                        >
                          <FormInput
                            type="text"
                            name={`notifications.${index}.config.recipients`}
                            placeholder="user@example.com, another@example.com"
                            onChange={(e) => {
                              const recipients = e.target.value.split(',').map(email => email.trim());
                              form.setValue(`notifications.${index}.config.recipients`, recipients);
                            }}
                          />
                        </FormField>
                      )}

                      {notification.type === 'slack' && (
                        <>
                          <FormField
                            name={`notifications.${index}.config.webhook`}
                            label="Webhook URL"
                            helperText="Slack incoming webhook URL"
                          >
                            <FormInput
                              type="text"
                              name={`notifications.${index}.config.webhook`}
                              placeholder="https://hooks.slack.com/services/..."
                            />
                          </FormField>
                          <FormField
                            name={`notifications.${index}.config.channel`}
                            label="Channel"
                            helperText="Optional: Override the webhook's default channel"
                          >
                            <FormInput
                              type="text"
                              name={`notifications.${index}.config.channel`}
                              placeholder="#alerts"
                            />
                          </FormField>
                        </>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const notifications = form.getValues('notifications');
                      form.setValue('notifications', [
                        ...notifications,
                        {
                          type: 'email',
                          config: { recipients: [] },
                          enabled: true,
                        },
                      ]);
                    }}
                    className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                  >
                    Add Notification
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => navigate(`/proxies/${id}`)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <FormSubmit>Save Alert</FormSubmit>
              </div>
            </Form>
          </FormProvider>
        </div>
      </div>
    </div>
  );
}
