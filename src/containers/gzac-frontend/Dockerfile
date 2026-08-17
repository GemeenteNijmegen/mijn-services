FROM ritense/gzac-frontend:12.6.0
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER 1000
# When the container starts, replace the env.js with values from environment variables
CMD ["/bin/sh",  "-c",  "envsubst < /usr/share/nginx/html/assets/config.template.js > /usr/share/nginx/html/assets/config.js && exec nginx -g 'daemon off;'"]
EXPOSE 8080