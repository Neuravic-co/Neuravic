{{- define "neuravic.labels" -}}
app.kubernetes.io/part-of: neuravic
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{/* Pod and container hardening shared by every workload. */}}
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

{{/* Environment shared by every backend container. */}}
{{- define "neuravic.backendEnv" -}}
- { name: APP_ENV, value: {{ .Values.config.appEnv | quote }} }
- { name: APP_URL, value: {{ .Values.config.appUrl | quote }} }
- { name: ALLOWED_ORIGINS, value: {{ .Values.config.allowedOrigins | quote }} }
- { name: EMAIL_FROM, value: {{ .Values.config.emailFrom | quote }} }
- { name: NOTIFY_TO, value: {{ .Values.config.notifyTo | quote }} }
- { name: BOOTSTRAP_ADMIN_EMAIL, value: {{ .Values.config.bootstrapAdminEmail | quote }} }
- { name: MAINTENANCE_MODE, value: {{ .Values.config.maintenanceMode | quote }} }
- { name: APP_VERSION, value: {{ .Values.image.tag | quote }} }
- { name: HOST, value: "0.0.0.0" }
- { name: AUTH_URL, value: "http://neuravic-auth:{{ .Values.services.auth.port }}" }
- { name: PORTAL_URL, value: "http://neuravic-portal:{{ .Values.services.portal.port }}" }
- { name: LEADS_URL, value: "http://neuravic-leads:{{ .Values.services.leads.port }}" }
- { name: ADMIN_URL, value: "http://neuravic-admin:{{ .Values.services.admin.port }}" }
- { name: FILES_URL, value: "http://neuravic-files:{{ .Values.files.port }}" }
- { name: WORKER_URL, value: "http://neuravic-worker:{{ .Values.services.worker.port }}" }
{{- range $key := list "DATABASE_URL" "PRIVACY_HASH_SECRET" "MFA_ENCRYPTION_KEY" "PROXY_SECRET" }}
- name: {{ $key }}
  valueFrom:
    secretKeyRef: { name: {{ $.Values.existingSecret }}, key: {{ $key }} }
{{- end }}
{{- range $key := list "RESEND_API_KEY" "SLACK_WEBHOOK_URL" "SSO_PRIVATE_JWK" }}
- name: {{ $key }}
  valueFrom:
    secretKeyRef: { name: {{ $.Values.existingSecret }}, key: {{ $key }}, optional: true }
{{- end }}
{{- end }}
