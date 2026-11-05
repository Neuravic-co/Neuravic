{{- define "neuravic.labels" -}}
app.kubernetes.io/part-of: neuravic
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "neuravic.podSecurity" -}}
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault
{{- end }}

{{- define "neuravic.containerSecurity" -}}
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
{{- end }}

{{- define "neuravic.backendEnv" -}}
- { name: APP_ENV, value: {{ .Values.config.appEnv | quote }} }
- { name: APP_URL, value: {{ .Values.config.appUrl | quote }} }
- { name: ALLOWED_ORIGINS, value: {{ .Values.config.allowedOrigins | quote }} }
- { name: EMAIL_FROM, value: {{ .Values.config.emailFrom | quote }} }
- { name: NOTIFY_TO, value: {{ .Values.config.notifyTo | quote }} }
- { name: MAINTENANCE_MODE, value: {{ .Values.config.maintenanceMode | quote }} }
- { name: APP_VERSION, value: {{ .Values.image.tag | quote }} }
- { name: HOST, value: "0.0.0.0" }
{{- range $key := list "DATABASE_URL" "PRIVACY_HASH_SECRET" "PROXY_SECRET" }}
- name: {{ $key }}
  valueFrom:
    secretKeyRef: { name: {{ $.Values.existingSecret }}, key: {{ $key }} }
{{- end }}
{{- range $key := list "TURNSTILE_SECRET" "RESEND_API_KEY" "SMTP_URL" "SLACK_WEBHOOK_URL" "CRON_SECRET" }}
- name: {{ $key }}
  valueFrom:
    secretKeyRef: { name: {{ $.Values.existingSecret }}, key: {{ $key }}, optional: true }
{{- end }}
{{- end }}
