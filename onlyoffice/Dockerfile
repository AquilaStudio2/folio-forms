FROM onlyoffice/documentserver:9.4.0.1

COPY fonts/ /usr/share/fonts/truetype/folio/

# true skips service restarts and cache flushing while building the image.
RUN chmod -R a+rX /usr/share/fonts/truetype/folio \
    && fc-cache -f \
    && /usr/bin/documentserver-generate-allfonts.sh true
