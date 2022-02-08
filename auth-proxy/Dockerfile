FROM nginx:alpine

RUN apk \
    --update \
    --no-cache \
    --virtual build-dependencies \
    add \
    apache2-utils

WORKDIR /etc/nginx

RUN rm /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf 
COPY nginx.conf /etc/nginx/nginx.conf

COPY ./init.sh ./init.sh
CMD /etc/nginx/init.sh && nginx -g 'daemon off;'
