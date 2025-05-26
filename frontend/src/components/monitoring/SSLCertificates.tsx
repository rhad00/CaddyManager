import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProxySSLCertificates, CertificateStatus } from "@/types/monitoring";

interface SSLCertificatesProps {
  certificates: ProxySSLCertificates;
}

export const SSLCertificates: React.FC<SSLCertificatesProps> = ({ certificates }) => {
  const getStatusColor = (status: CertificateStatus) => {
    switch (status) {
      case CertificateStatus.VALID:
        return "bg-green-500";
      case CertificateStatus.EXPIRING_SOON:
        return "bg-yellow-500";
      case CertificateStatus.EXPIRED:
      case CertificateStatus.INVALID:
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getDaysUntilExpiry = (validTo: string) => {
    const expiryDate = new Date(validTo);
    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatExpiryInfo = (validTo: string) => {
    const days = getDaysUntilExpiry(validTo);
    if (days < 0) {
      return "Expired";
    }
    if (days === 0) {
      return "Expires today";
    }
    if (days === 1) {
      return "Expires tomorrow";
    }
    return `Expires in ${days} days`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          SSL Certificates
          <Badge variant="outline" className="ml-2">
            {Object.values(certificates).flat().length} Certificates
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Object.entries(certificates).map(([_proxyId, certs]) =>
            certs.map((cert) => (
              <div
                key={cert.id}
                className="flex items-center justify-between p-3 bg-secondary/10 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-3 h-3 rounded-full ${getStatusColor(
                      cert.status
                    )}`}
                  />
                  <div>
                    <div className="font-medium">{cert.domain}</div>
                    <div className="text-sm text-muted-foreground">
                      {cert.issuer || "Unknown Issuer"}
                    </div>
                  </div>
                </div>
                <Badge
                  variant={
                    cert.status === CertificateStatus.VALID
                      ? "outline"
                      : "destructive"
                  }
                  className="ml-2"
                >
                  {formatExpiryInfo(cert.validTo)}
                </Badge>
              </div>
            ))
          )}
          {Object.keys(certificates).length === 0 && (
            <div className="text-center text-muted-foreground py-4">
              No SSL certificates available
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
