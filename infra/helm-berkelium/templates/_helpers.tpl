{{/* Common labels for every object. */}}
{{- define "bilbomd.labels" -}}
app.kubernetes.io/part-of: bilbomd
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{/*
Labels for a StatefulSet's volumeClaimTemplates. Kubernetes doesn't allow
those to change after the StatefulSet is created, so they leave out the
chart version, which would make every chart upgrade fail.
*/}}
{{- define "bilbomd.claimLabels" -}}
app.kubernetes.io/part-of: bilbomd
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Selector labels for one component: include "bilbomd.selector" (dict "component" "backend") */}}
{{- define "bilbomd.selector" -}}
app.kubernetes.io/name: bilbomd
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/* image reference: include "bilbomd.image" .Values.images.backend */}}
{{- define "bilbomd.image" -}}
{{ .repository }}:{{ .tag }}
{{- end -}}

{{- define "bilbomd.imagePullSecrets" -}}
{{- with .Values.images.pullSecrets }}
imagePullSecrets:
{{- range . }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end -}}

{{/* Container securityContext for non-root app containers. */}}
{{- define "bilbomd.containerSecurity" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: ["ALL"]
{{- end -}}
